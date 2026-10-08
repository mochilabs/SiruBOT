import { container } from '@sapphire/framework';
import { Prisma } from '@sirubot/prisma';
import { appEmoji } from '@sirubot/utils';

/** 지원하는 게임 ID */
const GAME_IDS = ['rps', 'guess', 'dice', 'attendance', 'quiz'] as const;
export type GameId = (typeof GAME_IDS)[number];

/** 전적 결과 */
export type GameResult = 'win' | 'loss' | 'draw' | 'checkin';

interface RpsStats {
	wins: number;
	losses: number;
	draws: number;
	/** 현재 연승 (0이면 연승 없음) */
	streak: number;
	/** 역대 최고 연승 */
	best: number;
}

interface CheckinState {
	/** 오늘 이미 출석했는지 */
	checkedIn: boolean;
	/** 연속 출석 일수 (오늘 출석 전이면 어제까지의 스트릭) */
	streak: number;
	/** 마지막 출석일 (KST, YYYY-MM-DD) */
	lastDay: string | null;
}

/** KST 기준 날짜 키 (YYYY-MM-DD) */
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

/** KST 기준 어제 날짜 키 */
function kstYesterdayKey(): string {
	return kstDayKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
}

/** GameRecord의 FK(User) 보장을 위해 유저 행이 없으면 생성해요. */
async function ensureUser(userId: string): Promise<void> {
	await container.db.user.upsert({
		where: { id: userId },
		create: { id: userId },
		update: {}
	});
}

/** 게임 결과 1건을 기록해요. */
export async function recordGameResult(userId: string, game: GameId, result: GameResult, meta?: Prisma.InputJsonValue): Promise<void> {
	await ensureUser(userId);
	await container.db.gameRecord.create({
		data: { userId, game, result, meta: meta ?? Prisma.DbNull }
	});
}

/** 가위바위보 전적 집계 (최근 5000건 기준) */
export async function getRpsStats(userId: string): Promise<RpsStats> {
	const records = await container.db.gameRecord.findMany({
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

/** 숫자맞히기 개인 최고 기록 (몇 번 만에 맞혔는지). 없으면 null */
export async function getGuessBest(userId: string): Promise<number | null> {
	const wins = await container.db.gameRecord.findMany({
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

/** 출석 상태 조회 */
export async function getCheckinState(userId: string): Promise<CheckinState> {
	const last = await container.db.gameRecord.findFirst({
		where: { userId, game: 'attendance' },
		orderBy: { playedAt: 'desc' },
		select: { meta: true }
	});
	const meta = (last?.meta as { streak?: unknown; day?: unknown } | null) ?? {};
	const streak = typeof meta.streak === 'number' ? meta.streak : 0;
	const lastDay = typeof meta.day === 'string' ? meta.day : null;
	return { checkedIn: lastDay === kstDayKey(), streak, lastDay };
}

/**
 * 출석 체크. 오늘 이미 했으면 { checkedIn: true }.
 * 연속 출석이면 streak+1, 끊겼으면 1부터.
 */
export async function doCheckin(userId: string): Promise<{ checkedIn: boolean; streak: number }> {
	const state = await getCheckinState(userId);
	if (state.checkedIn) return { checkedIn: true, streak: state.streak };

	const today = kstDayKey();
	const streak = state.lastDay === kstYesterdayKey() ? state.streak + 1 : 1;
	await recordGameResult(userId, 'attendance', 'checkin', { streak, day: today });
	return { checkedIn: false, streak };
}

/** 출석 스트릭 뱃지 이모지 */
export function streakBadge(streak: number): string {
	if (streak >= 365) return appEmoji('gem', '💎');
	if (streak >= 100) return appEmoji('crown', '👑');
	if (streak >= 30) return appEmoji('flash', '⚡');
	if (streak >= 7) return appEmoji('fire', '🔥');
	if (streak >= 1) return appEmoji('sprout', '🌱');
	return '';
}
