/**
 * 커스텀 명령어 저장소 — CustomCommand 테이블 + 길드별 메모리 캐시.
 *
 * - 읽기 경로는 접두사 리스너(모든 길드 메시지)와 함께여서, 캐시 미스 시에만 DB를 조회해요.
 *   커스텀 명령어가 없는 길드는 빈 결과가 캐시돼 DB를 다시 치지 않아요.
 * - 쓰기는 대시보드가 Prisma로 직접 해요. 저장 성공 브로드캐스트(GUILD_SETTINGS_INVALIDATE_CHANNEL)는
 *   guildSettingsInvalidator가 받아 clearGuildCustomCommandsCache()로 이 캐시도 함께 비워요.
 * - 브로드캐스트가 끊겨도 TTL(60초) 폴백으로 결국 최신을 봐요 (guildService 캐시와 같은 계약).
 */
import { container } from '@sapphire/framework';
import { MemoryCache, normalizeCustomCommandName } from '@sirubot/utils';

export interface CustomCommandEntry {
	id: string;
	/** 소문자 정규화된 이름(매칭 키로도 씀) */
	name: string;
	description: string;
	/** DB JSON 원문 — 신뢰할 수 없는 입력. 실행 전 스키마 재검증 필수 */
	spec: unknown;
}

export interface GuildCustomCommands {
	byName: Map<string, CustomCommandEntry>;
	/** 생성 순서 — !도움말 목록 표시용 */
	ordered: CustomCommandEntry[];
}

const EMPTY: GuildCustomCommands = { byName: new Map(), ordered: [] };

const cache = new MemoryCache<string, GuildCustomCommands>({ ttl: 60_000, maxSize: 500 });
const pendingReads = new Map<string, Promise<GuildCustomCommands | null>>();

async function load(guildId: string): Promise<GuildCustomCommands | null> {
	const rows = await container.db.customCommand.findMany({ where: { guildId }, orderBy: { createdAt: 'asc' } });
	const byName = new Map<string, CustomCommandEntry>();
	for (const row of rows) {
		const name = normalizeCustomCommandName(row.name);
		if (!name) continue;
		byName.set(name, { id: row.id, name, description: row.description, spec: row.spec });
	}
	return { byName, ordered: [...byName.values()] };
}

/** 길드 커스텀 명령어 목록 — DB 오류면 빈 목록(조용히 무시 정책 유지) */
export async function getGuildCustomCommands(guildId: string): Promise<GuildCustomCommands> {
	const cached = cache.get(guildId);
	if (cached) return cached;

	const pending = pendingReads.get(guildId);
	if (pending) return (await pending) ?? EMPTY;

	const read = load(guildId);
	pendingReads.set(guildId, read);
	try {
		const data = await read;
		if (data) cache.set(guildId, data);
		return data ?? EMPTY;
	} catch (error) {
		container.logger.error(
			`[customCommands] 길드 커스텀 명령어 조회 실패 (${guildId}): ${error instanceof Error ? error.message : String(error)}`
		);
		return EMPTY;
	} finally {
		if (pendingReads.get(guildId) === read) pendingReads.delete(guildId);
	}
}

export async function findCustomCommand(guildId: string, normalizedName: string): Promise<CustomCommandEntry | null> {
	const commands = await getGuildCustomCommands(guildId);
	return commands.byName.get(normalizedName) ?? null;
}

/** 대시보드 저장 브로드캐스트 수신 시 캐시를 비워요 — 다음 조회가 DB에서 다시 읽어요 */
export function clearGuildCustomCommandsCache(guildId: string): void {
	cache.delete(guildId);
}
