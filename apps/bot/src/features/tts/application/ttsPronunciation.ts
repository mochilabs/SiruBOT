import type { PrismaClient } from '@sirubot/prisma';
import { MemoryCache } from '@sirubot/utils';
import type { AppLogger } from '../../../lib/appLogger.ts';

/**
 * 길드별 TTS 발음 사전 — 채팅·알림 문장을 합성하기 전에 term을 reading으로 바꿔요.
 *
 * 저장은 Prisma `TtsPronunciation`(복합 PK guildId+term). 쓰기 때 같은 프로세스 캐시를 비우고,
 * 다른 프로세스는 TTL(60s)로 만료돼요. 조회 실패 시 원문 그대로 읽는 fail-safe예요.
 */

export const TTS_PRONUNCIATION_MAX_ENTRIES = 50;
export const TTS_PRONUNCIATION_TERM_MAX = 20;
export const TTS_PRONUNCIATION_READING_MAX = 40;

export interface TtsPronunciationEntry {
	term: string;
	reading: string;
}

export type SetPronunciationResult = 'ok' | 'limit' | 'error';

/** 긴 단어부터 치환해 "시루봇"이 "시루"보다 먼저 잡히게 한다. 대소문자는 구분하지 않는다. */
export function applyPronunciations(text: string, entries: readonly TtsPronunciationEntry[]): string {
	if (entries.length === 0) return text;
	const sorted = [...entries].sort((a, b) => b.term.length - a.term.length);
	const pattern = new RegExp(sorted.map((entry) => entry.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi');
	const readings = new Map(sorted.map((entry) => [entry.term.toLowerCase(), entry.reading]));
	return text.replace(pattern, (match) => readings.get(match.toLowerCase()) ?? match);
}

/** 발음 사전 서비스가 쓰는 의존성 */
export interface TtsPronunciationDeps {
	db: Pick<PrismaClient, 'ttsPronunciation'>;
	logger: AppLogger;
}

export class TtsPronunciationService {
	private readonly cache = new MemoryCache<string, TtsPronunciationEntry[]>({ ttl: 60_000, maxSize: 500 });

	public constructor(private readonly deps: TtsPronunciationDeps) {}

	public async list(guildId: string): Promise<TtsPronunciationEntry[]> {
		const cached = this.cache.get(guildId);
		if (cached) return cached;
		let entries: TtsPronunciationEntry[] = [];
		try {
			const rows = await this.deps.db.ttsPronunciation.findMany({ where: { guildId }, orderBy: { term: 'asc' } });
			entries = rows.map((row) => ({ term: row.term, reading: row.reading }));
		} catch (error) {
			this.deps.logger.error(`[ttsPronunciation] 조회 실패 guild=${guildId}: ${error instanceof Error ? error.message : String(error)}`);
			return [];
		}
		this.cache.set(guildId, entries);
		return entries;
	}

	public async apply(guildId: string, text: string): Promise<string> {
		return applyPronunciations(text, await this.list(guildId));
	}

	/** 추가·수정 — 새 단어일 때만 상한(50개)을 본다 */
	public async set(guildId: string, term: string, reading: string): Promise<SetPronunciationResult> {
		try {
			const existing = await this.deps.db.ttsPronunciation.findUnique({ where: { guildId_term: { guildId, term } } });
			if (!existing && (await this.deps.db.ttsPronunciation.count({ where: { guildId } })) >= TTS_PRONUNCIATION_MAX_ENTRIES) return 'limit';
			await this.deps.db.ttsPronunciation.upsert({
				where: { guildId_term: { guildId, term } },
				create: { guildId, term, reading },
				update: { reading }
			});
			this.cache.delete(guildId);
			return 'ok';
		} catch (error) {
			this.deps.logger.error(`[ttsPronunciation] 저장 실패 guild=${guildId}: ${error instanceof Error ? error.message : String(error)}`);
			return 'error';
		}
	}

	/** 삭제 — 지워진 항목이 있으면 true */
	public async remove(guildId: string, term: string): Promise<boolean> {
		try {
			const result = await this.deps.db.ttsPronunciation.deleteMany({ where: { guildId, term } });
			this.cache.delete(guildId);
			return result.count > 0;
		} catch (error) {
			this.deps.logger.error(`[ttsPronunciation] 삭제 실패 guild=${guildId}: ${error instanceof Error ? error.message : String(error)}`);
			return false;
		}
	}
}
