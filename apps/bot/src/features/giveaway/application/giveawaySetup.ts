import {
	buildGiveawayConditions,
	GIVEAWAY_DAYS_MAX,
	GIVEAWAY_PRIZE_MAX,
	GIVEAWAY_WINNERS_MAX,
	parseGiveawayDuration,
	type GiveawayCondition
} from '@sirubot/utils/giveaway';
import { parseKstDateTime } from '@sirubot/utils/scheduledMessage';

/**
 * `/나눔 시작` 설정 패널이 들고 있는 값 — 디스코드 객체 없이 순수 값만 둬요.
 * 마감은 "시작을 누른 시점 기준 N시간 뒤"(relative)와 "정해진 시각"(absolute) 두 가지예요. 패널을 열어 둔 사이 시간이 흘러도 기간이 줄지 않게 relative는 시작할 때 계산해요.
 */
export type GiveawaySetupEnd = { kind: 'relative'; ms: number } | { kind: 'absolute'; at: Date };

export interface GiveawaySetupState {
	prize: string | null;
	winnerCount: number;
	end: GiveawaySetupEnd | null;
	channelId: string;
	requiredRoleIds: string[];
	requiredMatch: 'any' | 'all';
	blockedRoleIds: string[];
	minJoinDays: number | null;
	minAccountDays: number | null;
}

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

/** 마감 빠른 선택 — value는 셀렉트 메뉴 값이에요 */
export const GIVEAWAY_QUICK_DURATIONS = [
	{ value: '1h', label: '1시간', ms: HOUR_MS },
	{ value: '6h', label: '6시간', ms: 6 * HOUR_MS },
	{ value: '12h', label: '12시간', ms: 12 * HOUR_MS },
	{ value: '1d', label: '1일', ms: DAY_MS },
	{ value: '3d', label: '3일', ms: 3 * DAY_MS },
	{ value: '7d', label: '7일', ms: 7 * DAY_MS }
] as const;

export function emptyGiveawaySetup(channelId: string): GiveawaySetupState {
	return {
		prize: null,
		winnerCount: 1,
		end: null,
		channelId,
		requiredRoleIds: [],
		requiredMatch: 'any',
		blockedRoleIds: [],
		minJoinDays: null,
		minAccountDays: null
	};
}

export function quickDuration(value: string) {
	return GIVEAWAY_QUICK_DURATIONS.find((item) => item.value === value) ?? null;
}

/** 지금 기준의 마감 시각. 아직 정하지 않았으면 null */
export function resolveSetupEnd(end: GiveawaySetupEnd | null, now: Date): Date | null {
	if (!end) return null;
	return end.kind === 'absolute' ? end.at : new Date(now.getTime() + end.ms);
}

/** 시작하려면 더 채워야 하는 항목 (한국어 이름) */
export function missingSetupFields(state: GiveawaySetupState): string[] {
	const missing: string[] = [];
	if (!state.prize) missing.push('상품');
	if (!state.end) missing.push('마감');
	return missing;
}

export function setupConditions(state: GiveawaySetupState): GiveawayCondition[] {
	return buildGiveawayConditions({
		requiredRoleIds: state.requiredRoleIds,
		requiredMatch: state.requiredMatch,
		blockedRoleIds: state.blockedRoleIds,
		minJoinDays: state.minJoinDays,
		minAccountAgeDays: state.minAccountDays
	});
}

/** 모달 입력 한 칸의 결과 — 값이 올바르면 value, 아니면 사용자에게 보여줄 문구 */
export type SetupParse<T> = { ok: true; value: T } | { ok: false; message: string };

/** 마감 입력: "30분", "2h", "1d12h"(기간) 또는 "2026-12-25 21:00"(한국 시간) */
export function parseSetupEnd(text: string): SetupParse<GiveawaySetupEnd> {
	const source = text.trim();
	if (/^\d{4}-\d{2}-\d{2}/.test(source)) {
		const at = parseKstDateTime(source);
		return at
			? { ok: true, value: { kind: 'absolute', at } }
			: { ok: false, message: '마감 시각은 "2026-12-25 21:00"처럼 적어 주세요. (한국 시간)' };
	}
	const ms = parseGiveawayDuration(source);
	return ms === null
		? { ok: false, message: '마감은 "30분", "2h", "1d12h"처럼 기간으로, 또는 "2026-12-25 21:00"처럼 한국 시간으로 적어 주세요.' }
		: { ok: true, value: { kind: 'relative', ms } };
}

export function parseSetupPrize(text: string): SetupParse<string> {
	const prize = text.trim();
	if (!prize) return { ok: false, message: '상품을 적어 주세요.' };
	if (prize.length > GIVEAWAY_PRIZE_MAX) return { ok: false, message: `상품은 ${GIVEAWAY_PRIZE_MAX}자 이하로 적어 주세요.` };
	return { ok: true, value: prize };
}

export function parseSetupWinners(text: string): SetupParse<number> {
	const source = text.trim();
	const count = /^\d+$/.test(source) ? Number(source) : NaN;
	return Number.isInteger(count) && count >= 1 && count <= GIVEAWAY_WINNERS_MAX
		? { ok: true, value: count }
		: { ok: false, message: `당첨자 수는 1~${GIVEAWAY_WINNERS_MAX} 사이 숫자로 적어 주세요.` };
}

/** 일수 입력: 비우면 조건 없음(null) */
export function parseSetupDays(text: string, label: string): SetupParse<number | null> {
	const source = text.trim();
	if (!source) return { ok: true, value: null };
	const days = /^\d+$/.test(source) ? Number(source) : NaN;
	return Number.isInteger(days) && days >= 1 && days <= GIVEAWAY_DAYS_MAX
		? { ok: true, value: days }
		: { ok: false, message: `${label}은 비우거나 1~${GIVEAWAY_DAYS_MAX} 사이 숫자로 적어 주세요.` };
}
