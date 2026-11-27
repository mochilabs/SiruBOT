import type { PrismaClient } from '@sirubot/prisma';
import { MemoryCache, normalizeCustomCommandName, type CustomCommandMethod } from '@sirubot/utils';
import type { AppLogger } from '../../../lib/appLogger.ts';

export interface CustomCommandEntry {
	id: string;
	name: string;
	description: string;
	method: CustomCommandMethod;
	spec: unknown;
}

export interface GuildCustomCommands {
	byName: Map<string, CustomCommandEntry>;
	ordered: CustomCommandEntry[];
}

export interface CustomCommandStoreDeps {
	db: PrismaClient;
	logger: AppLogger;
}

const EMPTY: GuildCustomCommands = { byName: new Map(), ordered: [] };

export function createCustomCommandStore({ db, logger }: CustomCommandStoreDeps) {
	const cache = new MemoryCache<string, GuildCustomCommands>({ ttl: 60_000, maxSize: 500 });
	const pendingReads = new Map<string, Promise<GuildCustomCommands | null>>();

	async function load(guildId: string): Promise<GuildCustomCommands | null> {
		const rows = await db.customCommand.findMany({ where: { guildId }, orderBy: { createdAt: 'asc' } });
		const byName = new Map<string, CustomCommandEntry>();
		for (const row of rows) {
			const name = normalizeCustomCommandName(row.name);
			if (!name) continue;
			const method: CustomCommandMethod = row.method === 'slash' ? 'slash' : 'prefix';
			byName.set(name, { id: row.id, name, description: row.description, method, spec: row.spec });
		}
		return { byName, ordered: [...byName.values()] };
	}

	async function getGuildCustomCommands(guildId: string): Promise<GuildCustomCommands> {
		const cached = cache.get(guildId);
		if (cached) return cached;

		const pending = pendingReads.get(guildId);
		// 선점한 호출자와 대기자 모두 DB 오류 시 빈 목록 정책을 공유하도록 catch를 통일해요.
		if (pending) return (await pending.catch(() => null)) ?? EMPTY;

		const read = load(guildId);
		pendingReads.set(guildId, read);
		try {
			const data = await read;
			if (data) cache.set(guildId, data);
			return data ?? EMPTY;
		} catch (error) {
			logger.error(`[customCommands] 길드 커스텀 명령어 조회 실패 (${guildId}): ${error instanceof Error ? error.message : String(error)}`);
			return EMPTY;
		} finally {
			if (pendingReads.get(guildId) === read) pendingReads.delete(guildId);
		}
	}

	async function findCustomCommand(guildId: string, normalizedName: string): Promise<CustomCommandEntry | null> {
		const commands = await getGuildCustomCommands(guildId);
		return commands.byName.get(normalizedName) ?? null;
	}

	/** 대시보드 저장 브로드캐스트 수신 시 캐시를 비워요 — 다음 조회가 DB에서 다시 읽어요 */
	function clearGuildCustomCommandsCache(guildId: string): void {
		cache.delete(guildId);
	}

	return { getGuildCustomCommands, findCustomCommand, clearGuildCustomCommandsCache };
}

export type CustomCommandStore = ReturnType<typeof createCustomCommandStore>;
