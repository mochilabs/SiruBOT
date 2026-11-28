import type { PrismaClient } from '@sirubot/prisma';

const HISTORY_SAMPLE = 100;
const TOP_LIMIT = 10;
const RECENT_LIMIT = 15;
const TOP_MIN_PLAYS = 2;
const CACHE_TTL_MS = 60_000;
const CACHE_MAX_USERS = 1_000;

export interface TrackSuggestion {
	title: string;
	artist: string;
	url: string;
}

export interface SuggestionHistoryRow {
	trackId: string;
	track: TrackSuggestion;
}

export function mixSuggestions(rows: readonly SuggestionHistoryRow[], random: () => number = Math.random): TrackSuggestion[] {
	const counts = new Map<string, number>();
	const recent: SuggestionHistoryRow[] = [];
	for (const row of rows) {
		const count = counts.get(row.trackId) ?? 0;
		if (count === 0) recent.push(row);
		counts.set(row.trackId, count + 1);
	}

	const top = recent
		.filter((row) => (counts.get(row.trackId) ?? 0) >= TOP_MIN_PLAYS)
		.sort((a, b) => (counts.get(b.trackId) ?? 0) - (counts.get(a.trackId) ?? 0))
		.slice(0, TOP_LIMIT);
	const topIds = new Set(top.map((row) => row.trackId));
	const rest = recent.filter((row) => !topIds.has(row.trackId)).slice(0, RECENT_LIMIT);

	const mixed = [...top, ...rest].map((row) => row.track);
	for (let i = mixed.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[mixed[i], mixed[j]] = [mixed[j]!, mixed[i]!];
	}
	return mixed;
}

export interface TrackSuggestionServiceDeps {
	db: Pick<PrismaClient, 'guildTrackHistory'>;
	now?: () => number;
	random?: () => number;
}

export class TrackSuggestionService {
	// 자동완성은 키 입력마다 다시 불리므로, 섞은 순서를 잠깐 고정해 목록이 흔들리지 않게 한다.
	private readonly cache = new Map<string, { expiresAt: number; suggestions: TrackSuggestion[] }>();
	private readonly inFlight = new Map<string, Promise<TrackSuggestion[]>>();

	public constructor(private readonly deps: TrackSuggestionServiceDeps) {}

	public async getForUser(userId: string): Promise<TrackSuggestion[]> {
		const now = this.deps.now?.() ?? Date.now();
		const cached = this.cache.get(userId);
		if (cached && cached.expiresAt > now) return cached.suggestions;

		const pending = this.inFlight.get(userId);
		if (pending) return pending;

		const request = this.load(userId, now).finally(() => this.inFlight.delete(userId));
		this.inFlight.set(userId, request);
		return request;
	}

	private async load(userId: string, now: number): Promise<TrackSuggestion[]> {
		const rows = await this.deps.db.guildTrackHistory.findMany({
			where: { userId },
			orderBy: { createdAt: 'desc' },
			take: HISTORY_SAMPLE,
			select: { trackId: true, track: { select: { title: true, artist: true, url: true } } }
		});
		const suggestions = mixSuggestions(rows, this.deps.random);

		if (this.cache.size >= CACHE_MAX_USERS) this.pruneCache(now);
		this.cache.set(userId, { expiresAt: now + CACHE_TTL_MS, suggestions });
		return suggestions;
	}

	private pruneCache(now: number): void {
		for (const [key, entry] of this.cache) {
			if (entry.expiresAt <= now) this.cache.delete(key);
		}
		if (this.cache.size >= CACHE_MAX_USERS) this.cache.clear();
	}
}
