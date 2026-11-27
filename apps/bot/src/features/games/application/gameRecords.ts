import { Prisma, type PrismaClient } from '@sirubot/prisma';
import { emoji } from '@sirubot/utils';

const GAME_IDS = ['rps', 'guess', 'attendance'] as const;
export type GameId = (typeof GAME_IDS)[number];

export type GameResult = 'win' | 'loss' | 'draw' | 'checkin';

interface RpsStats {
	wins: number;
	losses: number;
	draws: number;
	streak: number;
	best: number;
}

interface CheckinState {
	checkedIn: boolean;
	streak: number;
	lastDay: string | null;
}

function kstDayKey(date: Date = new Date()): string {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Asia/Seoul',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(date);
	const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
	return `${get('year')}-${get('month')}-${get('day')}`;
}

function kstYesterdayKey(): string {
	return kstDayKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
}

export interface GameLockStore {
	setCacheValueNX(key: string, value: string, ttlSeconds: number): Promise<boolean>;
}

export interface GameRecordsDeps {
	db: PrismaClient;
	getLockStore: () => GameLockStore | undefined;
}

export function createGameRecords({ db, getLockStore }: GameRecordsDeps) {
	async function ensureUser(userId: string): Promise<void> {
		await db.user.upsert({
			where: { id: userId },
			create: { id: userId },
			update: {}
		});
	}

	async function recordGameResult(userId: string, game: GameId, result: GameResult, meta?: Prisma.InputJsonValue): Promise<void> {
		await ensureUser(userId);
		await db.gameRecord.create({
			data: { userId, game, result, meta: meta ?? Prisma.DbNull }
		});
	}

	async function getRpsStats(userId: string): Promise<RpsStats> {
		const records = await db.gameRecord.findMany({
			where: { userId, game: 'rps' },
			orderBy: { playedAt: 'desc' },
			take: 5000,
			select: { result: true }
		});

		let wins = 0;
		let losses = 0;
		let draws = 0;
		for (const r of records) {
			if (r.result === 'win') wins += 1;
			else if (r.result === 'loss') losses += 1;
			else if (r.result === 'draw') draws += 1;
		}

		let streak = 0;
		for (const r of records) {
			if (r.result !== 'win') break;
			streak += 1;
		}

		let best = 0;
		let run = 0;
		for (let i = records.length - 1; i >= 0; i -= 1) {
			if (records[i]!.result === 'win') {
				run += 1;
				if (run > best) best = run;
			} else {
				run = 0;
			}
		}

		return { wins, losses, draws, streak, best };
	}

	async function getGuessBest(userId: string): Promise<number | null> {
		const wins = await db.gameRecord.findMany({
			where: { userId, game: 'guess', result: 'win' },
			orderBy: { playedAt: 'desc' },
			take: 1000,
			select: { meta: true }
		});
		let best: number | null = null;
		for (const w of wins) {
			const attempts = (w.meta as { attempts?: unknown } | null)?.attempts;
			if (typeof attempts === 'number' && Number.isInteger(attempts) && attempts > 0) {
				best = best == null ? attempts : Math.min(best, attempts);
			}
		}
		return best;
	}

	async function getCheckinState(userId: string): Promise<CheckinState> {
		const last = await db.gameRecord.findFirst({
			where: { userId, game: 'attendance' },
			orderBy: { playedAt: 'desc' },
			select: { meta: true }
		});
		const meta = (last?.meta as { streak?: unknown; day?: unknown } | null) ?? {};
		const streak = typeof meta.streak === 'number' ? meta.streak : 0;
		const lastDay = typeof meta.day === 'string' ? meta.day : null;
		return { checkedIn: lastDay === kstDayKey(), streak, lastDay };
	}

	async function doCheckin(userId: string): Promise<{ checkedIn: boolean; streak: number }> {
		const today = kstDayKey();
		const state = await getCheckinState(userId);
		if (state.lastDay === today) return { checkedIn: true, streak: state.streak };

		// 읽기→쓰기 사이 동시 출석의 중복 streak을 막기 위해 Redis NX 락으로 직렬화해요
		const store = getLockStore();
		const lockKey = `attendance/lock/${userId}/${today}`;
		const acquired = (await store?.setCacheValueNX(lockKey, '1', 60 * 60 * 24 * 2)) ?? true;
		if (!acquired) {
			// 락은 선점됐지만 레코드가 아직 커밋되지 않은 구간
			const retry = await getCheckinState(userId);
			return { checkedIn: true, streak: retry.streak };
		}

		const streak = state.lastDay === kstYesterdayKey() ? state.streak + 1 : 1;
		await recordGameResult(userId, 'attendance', 'checkin', { streak, day: today });
		return { checkedIn: false, streak };
	}

	return { recordGameResult, getRpsStats, getGuessBest, getCheckinState, doCheckin };
}

export type GameRecords = ReturnType<typeof createGameRecords>;

export function streakBadge(streak: number): string {
	if (streak >= 365) return emoji('gem');
	if (streak >= 100) return emoji('crown');
	if (streak >= 30) return emoji('flash');
	if (streak >= 7) return emoji('fire');
	if (streak >= 1) return emoji('sprout');
	return '';
}
