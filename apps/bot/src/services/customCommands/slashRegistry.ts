/**
 * 커스텀 슬래시 명령어 동기화 — DB의 method='slash' 명령어를 길드 애플리케이션 커맨드로 등록/해제해요.
 *
 * - 대시보드 저장/삭제 → data-api → Redis 무효화 브로드캐스트 → guildSettingsInvalidator가
 *   이 동기화를 불러요. 같은 브로드캐스트를 여러 번 받아도 결과가 같도록(멱등) "가진 것과 DB를
 *   맞춘다" 방식이에요.
 * - 봇 본 커맨드와 충돌하지 않도록 ID 기반 증분 동기화(create/edit/delete)를 써요 —
 *   guild.commands.set(전체 교체)는 본 커맨드를 지우므로 쓰지 않아요.
 * - 잔여 정리(stale delete)는 "우리 DB 행에도 없고 봇 본 커맨드 이름도 아닌" 길드 커맨드만
 *   지워요. 삭제된 행의 applicationCommandId는 행이 사라진 뒤 알 수 없으므로 이 방식으로만 정리돼요.
 * - 실패해도 다음 브로드캐스트에서 재시도돼요 — 절대 프로세스를 크래시시키지 않아요.
 */
import { container } from '@sapphire/framework';
import { ApplicationCommandOptionType, type ApplicationCommandOptionData } from 'discord.js';
import { CUSTOM_COMMAND_MAX_ARGS, CUSTOM_COMMAND_MAX_SLASH_PER_GUILD, normalizeCustomCommandName } from '@sirubot/utils';

export interface SlashSyncLogger {
	info(msg: string): void;
	warn(msg: string): void;
	error(msg: string): void;
	debug(msg: string): void;
}

/** 문자열·조건의 {argvN}/index에서 인수 사용처를 모아요 */
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

/** 스펙이 실제로 쓰는 인수 개수 — {argv3}까지 있으면 4 */
export function countArgOptions(spec: unknown): number {
	const indexes: number[] = [];
	collectArgIndexes(spec, indexes);
	if (indexes.length === 0) return 0;
	return Math.min(Math.max(...indexes) + 1, CUSTOM_COMMAND_MAX_ARGS);
}

/** 슬래시 옵션 자동 생성 — argument1..N (전부 선택형 문자열) */
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

/** 길드별 동기화 직렬화 — 무효화 브로드캐스트가 겹쳐도 한 번에 하나만 */
const syncChains = new Map<string, Promise<void>>();

/** 저장/삭제 브로드캐스트 때마다 불려요. 이 길드를 보유한 레플리카만 실제 동작해요. */
export function syncGuildSlashCommands(guildId: string, logger: SlashSyncLogger): Promise<void> {
	const previous = syncChains.get(guildId) ?? Promise.resolve();
	const next = previous
		.then(() => doSync(guildId, logger))
		.catch((error: unknown) => {
			logger.warn(`[customCommands] 슬래시 동기화 실패 (guild ${guildId}): ${error instanceof Error ? error.message : String(error)}`);
		});
	syncChains.set(guildId, next);
	return next;
}

async function doSync(guildId: string, logger: SlashSyncLogger): Promise<void> {
	const guild = container.client.guilds.cache.get(guildId);
	if (!guild) return; // 다른 레플리카가 보유한 길드

	const rows = await container.db.customCommand.findMany({ where: { guildId, method: 'slash' } });
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
					await container.db.customCommand.update({ where: { id: row.id }, data: { applicationCommandId: created.id } });
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
				await container.db.customCommand.update({ where: { id: row.id }, data: { applicationCommandId: existing.id } });
			}
		} catch (error) {
			logger.warn(
				`[customCommands] 슬래시 동기화 항목 실패 (guild ${guildId}/${name}): ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	// 잔여 정리 — 우리 행에도 없고 봇 본 커맨드도 아닌 길드 커맨드만 삭제해요
	const coreNames = new Set(container.stores.get('commands').keys());
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
