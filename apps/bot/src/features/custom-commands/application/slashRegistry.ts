import { ApplicationCommandOptionType, type ApplicationCommandOptionData, type Guild } from 'discord.js';
import type { PrismaClient } from '@sirubot/prisma';
import { CUSTOM_COMMAND_MAX_ARGS, CUSTOM_COMMAND_MAX_SLASH_PER_GUILD, normalizeCustomCommandName } from '@sirubot/utils';
import type { AppLogger } from '../../../lib/appLogger.ts';

function collectArgIndexes(node: unknown, into: number[]): void {
	if (typeof node === 'string') {
		for (const match of node.matchAll(/\{argv(\d+)\}/gu)) into.push(Number(match[1]));
		return;
	}
	if (Array.isArray(node)) {
		for (const child of node) collectArgIndexes(child, into);
		return;
	}
	if (node && typeof node === 'object') {
		for (const [key, value] of Object.entries(node)) {
			if (key === 'index' && typeof value === 'number') into.push(value);
			else collectArgIndexes(value, into);
		}
	}
}

export function countArgOptions(spec: unknown): number {
	const indexes: number[] = [];
	collectArgIndexes(spec, indexes);
	if (indexes.length === 0) return 0;
	return Math.min(Math.max(...indexes) + 1, CUSTOM_COMMAND_MAX_ARGS);
}

export function buildSlashOptions(spec: unknown): ApplicationCommandOptionData[] {
	return Array.from({ length: countArgOptions(spec) }, (_unused, index) => ({
		name: `argument${index + 1}`,
		description: `명령어 인자 ${index + 1}`,
		type: ApplicationCommandOptionType.String,
		required: false
	}));
}

function optionNames(options: readonly { name: string }[]): string[] {
	return options.map((option) => option.name);
}

export interface SlashRegistryDeps {
	db: PrismaClient;
	/** 이 프로세스가 보유한 길드만 돌려줘요 (캐시 조회) */
	getGuild(guildId: string): Guild | undefined;
	/** 봇 본 슬래시 커맨드 이름 — 잔여 정리에서 지우지 않아요 */
	getCoreCommandNames(): Iterable<string>;
}

/** 길드별 동기화 직렬화 체인은 인스턴스가 소유해요 — BotApplication.setupServices가 한 번 만들어 container.customSlashRegistry로 노출해요. */
export function createSlashRegistry({ db, getGuild, getCoreCommandNames }: SlashRegistryDeps) {
	/** 길드별 동기화 직렬화 — 무효화 브로드캐스트가 겹쳐도 한 번에 하나만 */
	const syncChains = new Map<string, Promise<void>>();

	/** 저장/삭제 브로드캐스트 때마다 불려요. 이 길드를 보유한 레플리카만 실제 동작해요. */
	function syncGuildSlashCommands(guildId: string, logger: AppLogger): Promise<void> {
		const previous = syncChains.get(guildId) ?? Promise.resolve();
		const next = previous
			.then(() => doSync(guildId, logger))
			.catch((error: unknown) => {
				logger.warn(`[customCommands] 슬래시 동기화 실패 (guild ${guildId}): ${error instanceof Error ? error.message : String(error)}`);
			});
		syncChains.set(guildId, next);
		return next;
	}

	async function doSync(guildId: string, logger: AppLogger): Promise<void> {
		const guild = getGuild(guildId);
		if (!guild) return; // 다른 레플리카가 보유한 길드

		const rows = await db.customCommand.findMany({ where: { guildId, method: 'slash' } });
		if (rows.length > CUSTOM_COMMAND_MAX_SLASH_PER_GUILD) {
			logger.warn(
				`[customCommands] 슬래시 명령어가 ${CUSTOM_COMMAND_MAX_SLASH_PER_GUILD}개를 넘어요 (guild ${guildId}, ${rows.length}개) — 초과분은 대시보드에서 줄여 주세요`
			);
		}

		const fetched = Array.from((await guild.commands.fetch()).values());
		const byId = new Map(fetched.map((command) => [command.id, command]));
		const keptIds = new Set<string>();

		for (const row of rows) {
			const name = normalizeCustomCommandName(row.name);
			const description = row.description.trim().slice(0, 100) || '커스텀 명령어';
			const options = buildSlashOptions(row.spec);
			try {
				const existing =
					(row.applicationCommandId ? byId.get(row.applicationCommandId) : undefined) ?? fetched.find((command) => command.name === name);
				if (!existing) {
					const created = await guild.commands.create({ name, description, options });
					keptIds.add(created.id);
					if (row.applicationCommandId !== created.id) {
						await db.customCommand.update({ where: { id: row.id }, data: { applicationCommandId: created.id } });
					}
					logger.debug(`커스텀 슬래시 등록: ${guildId}/${name} → ${created.id}`);
					continue;
				}
				keptIds.add(existing.id);
				if (
					existing.name !== name ||
					existing.description !== description ||
					optionNames(existing.options ?? []).join(',') !== optionNames(options).join(',')
				) {
					await guild.commands.edit(existing.id, { name, description, options });
					logger.debug(`커스텀 슬래시 갱신: ${guildId}/${name} → ${existing.id}`);
				}
				if (row.applicationCommandId !== existing.id) {
					await db.customCommand.update({ where: { id: row.id }, data: { applicationCommandId: existing.id } });
				}
			} catch (error) {
				logger.warn(
					`[customCommands] 슬래시 동기화 항목 실패 (guild ${guildId}/${name}): ${error instanceof Error ? error.message : String(error)}`
				);
			}
		}

		// 잔여 정리 — 우리 행에도 없고 봇 본 커맨드도 아닌 길드 커맨드만 삭제해요
		const coreNames = new Set(getCoreCommandNames());
		for (const command of fetched) {
			if (keptIds.has(command.id) || coreNames.has(command.name)) continue;
			try {
				await guild.commands.delete(command.id);
				logger.debug(`커스텀 슬래시 잔여 삭제: ${guildId}/${command.name} → ${command.id}`);
			} catch (error) {
				logger.warn(
					`[customCommands] 슬래시 잔여 삭제 실패 (guild ${guildId}/${command.name}): ${error instanceof Error ? error.message : String(error)}`
				);
			}
		}
	}

	return { syncGuildSlashCommands };
}

export type SlashRegistry = ReturnType<typeof createSlashRegistry>;
