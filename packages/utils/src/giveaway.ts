import { z } from 'zod';

/**
 * 기브어웨이 계약 — 참여 조건, 추첨, 입력 검증을 봇과 대시보드가 함께 써요.
 * 저장은 `Giveaway`/`GiveawayEntry`이고, 마감은 `ScheduledJob`(kind `giveaway_end`, payload `{ giveawayId }`)이 맡아요.
 * 이 파일은 순수 함수만 둬요(난수는 호출하는 쪽이 `randomInt`로 넘겨요).
 */

export const GIVEAWAY_KIND = 'giveaway_end';

export const GIVEAWAY_PRIZE_MAX = 200;
export const GIVEAWAY_WINNERS_MAX = 20;
/** 서버당 동시에 진행할 수 있는 기브어웨이 수 */
export const GIVEAWAY_MAX_RUNNING = 10;
export const GIVEAWAY_MIN_DURATION_MS = 60_000;
export const GIVEAWAY_MAX_DURATION_MS = 30 * 24 * 60 * 60_000;
/** 참여자 수가 바뀌어도 카드는 이 간격(ms)에 한 번만 고쳐요 (디스코드 편집 한도) */
export const GIVEAWAY_CARD_UPDATE_INTERVAL_MS = 10_000;
export const GIVEAWAY_CONDITIONS_MAX = 10;
export const GIVEAWAY_ROLES_PER_CONDITION_MAX = 10;
export const GIVEAWAY_DAYS_MAX = 3650;

export const GIVEAWAY_STATUSES = ['running', 'ended', 'cancelled'] as const;
export type GiveawayStatus = (typeof GIVEAWAY_STATUSES)[number];

const DAY_MS = 24 * 60 * 60_000;
const snowflake = z.string().regex(/^\d{17,20}$/, '올바른 ID 형식이 아니에요.');
const roleIds = z.array(snowflake).min(1).max(GIVEAWAY_ROLES_PER_CONDITION_MAX);
const days = z.number().int().min(1).max(GIVEAWAY_DAYS_MAX);

/* ---------------------------------------------------------------- 조건 */

/**
 * 참여 조건. `type`으로 갈라지는 목록이라 새 조건은 여기에 스키마 하나와 평가 함수 하나(`EVALUATORS`)만 더하면 돼요.
 * 모든 조건을 통과해야 참여할 수 있어요.
 */
export const giveawayConditionSchema = z.discriminatedUnion('type', [
	/** 필요한 역할 — any는 하나라도, all은 모두 가져야 해요 */
	z.object({ type: z.literal('requiredRoles'), roleIds, match: z.enum(['any', 'all']).default('any') }),
	/** 이 역할 중 하나라도 있으면 참여할 수 없어요 */
	z.object({ type: z.literal('blockedRoles'), roleIds }),
	/** 서버에 들어온 지 N일 이상 */
	z.object({ type: z.literal('minJoinDays'), days }),
	/** 디스코드 계정을 만든 지 N일 이상 */
	z.object({ type: z.literal('minAccountAgeDays'), days })
]);
export type GiveawayCondition = z.infer<typeof giveawayConditionSchema>;

export const giveawayRequirementsSchema = z.object({
	version: z.literal(1),
	conditions: z.array(giveawayConditionSchema).max(GIVEAWAY_CONDITIONS_MAX)
});
export type GiveawayRequirements = z.infer<typeof giveawayRequirementsSchema>;

export const EMPTY_GIVEAWAY_REQUIREMENTS: GiveawayRequirements = { version: 1, conditions: [] };

/** DB의 JSON을 조건 목록으로. 형식이 깨졌으면 null이에요 (호출하는 쪽은 안전한 쪽, 곧 참여 불가로 다뤄요) */
export function parseGiveawayRequirements(raw: unknown): GiveawayRequirements | null {
	const result = giveawayRequirementsSchema.safeParse(raw);
	return result.success ? result.data : null;
}

/** 조건을 확인할 때 필요한 멤버 정보 — 디스코드 객체 대신 이 값만 넘겨요 */
export interface GiveawayMemberFacts {
	roleIds: readonly string[];
	/** 서버에 들어온 시각. 모르면 null */
	joinedAt: Date | null;
	accountCreatedAt: Date;
}

export interface GiveawayEligibility {
	ok: boolean;
	/** 통과하지 못한 이유 (한국어 한 줄씩) */
	reasons: string[];
}

type ConditionOf<T extends GiveawayCondition['type']> = Extract<GiveawayCondition, { type: T }>;

const roleList = (ids: readonly string[]) => ids.map((id) => `<@&${id}>`).join(' ');
const elapsedDays = (from: Date, now: Date) => Math.floor((now.getTime() - from.getTime()) / DAY_MS);

const EVALUATORS: { [T in GiveawayCondition['type']]: (condition: ConditionOf<T>, member: GiveawayMemberFacts, now: Date) => string | null } = {
	requiredRoles(condition, member) {
		const has = condition.roleIds.filter((id) => member.roleIds.includes(id));
		if (condition.match === 'all') {
			const missing = condition.roleIds.filter((id) => !member.roleIds.includes(id));
			return missing.length === 0 ? null : `필요한 역할이 없어요: ${roleList(missing)}`;
		}
		return has.length > 0 ? null : `다음 역할 중 하나가 필요해요: ${roleList(condition.roleIds)}`;
	},
	blockedRoles(condition, member) {
		const blocked = condition.roleIds.filter((id) => member.roleIds.includes(id));
		return blocked.length === 0 ? null : `이 역할이 있으면 참여할 수 없어요: ${roleList(blocked)}`;
	},
	minJoinDays(condition, member, now) {
		if (!member.joinedAt) return '서버에 들어온 시각을 확인할 수 없어요.';
		const joined = elapsedDays(member.joinedAt, now);
		return joined >= condition.days ? null : `서버에 들어온 지 ${condition.days}일 이상이어야 해요. (지금 ${Math.max(0, joined)}일)`;
	},
	minAccountAgeDays(condition, member, now) {
		const age = elapsedDays(member.accountCreatedAt, now);
		return age >= condition.days ? null : `디스코드 계정을 만든 지 ${condition.days}일 이상이어야 해요. (지금 ${Math.max(0, age)}일)`;
	}
};

/** 모든 조건을 평가해요. 조건이 없으면 누구나 통과해요 */
export function evaluateGiveawayConditions(conditions: readonly GiveawayCondition[], member: GiveawayMemberFacts, now: Date): GiveawayEligibility {
	const reasons: string[] = [];
	for (const condition of conditions) {
		const evaluate = EVALUATORS[condition.type] as (c: GiveawayCondition, m: GiveawayMemberFacts, n: Date) => string | null;
		const reason = evaluate(condition, member, now);
		if (reason) reasons.push(reason);
	}
	return { ok: reasons.length === 0, reasons };
}

/** 카드·안내에 보여줄 조건 한 줄 */
export function describeGiveawayCondition(condition: GiveawayCondition): string {
	switch (condition.type) {
		case 'requiredRoles':
			return condition.match === 'all' ? `역할 모두 필요: ${roleList(condition.roleIds)}` : `역할 중 하나 필요: ${roleList(condition.roleIds)}`;
		case 'blockedRoles':
			return `제외 역할: ${roleList(condition.roleIds)}`;
		case 'minJoinDays':
			return `서버 가입 ${condition.days}일 이상`;
		case 'minAccountAgeDays':
			return `계정 생성 ${condition.days}일 이상`;
	}
}

/** 입력 옵션으로 조건 목록을 만들어요. 값이 없는 항목은 건너뛰어요 */
export function buildGiveawayConditions(input: {
	requiredRoleIds?: readonly string[];
	requiredMatch?: 'any' | 'all';
	blockedRoleIds?: readonly string[];
	minJoinDays?: number | null;
	minAccountAgeDays?: number | null;
}): GiveawayCondition[] {
	const unique = (ids: readonly string[] | undefined) => [...new Set(ids ?? [])];
	const conditions: GiveawayCondition[] = [];
	const required = unique(input.requiredRoleIds);
	if (required.length > 0) conditions.push({ type: 'requiredRoles', roleIds: required, match: input.requiredMatch ?? 'any' });
	const blocked = unique(input.blockedRoleIds);
	if (blocked.length > 0) conditions.push({ type: 'blockedRoles', roleIds: blocked });
	if (input.minJoinDays) conditions.push({ type: 'minJoinDays', days: input.minJoinDays });
	if (input.minAccountAgeDays) conditions.push({ type: 'minAccountAgeDays', days: input.minAccountAgeDays });
	return conditions;
}

/* ---------------------------------------------------------------- 추첨 */

/**
 * 후보에서 중복 없이 count명을 골라요 (부분 Fisher-Yates). 후보보다 많이 달라면 전부 돌려줘요.
 * `randomInt(max)`는 0 이상 max 미만의 균등한 정수를 돌려줘야 해요. 봇은 `crypto.randomInt`를 넘겨요.
 */
export function drawWinners<T>(candidates: readonly T[], count: number, randomInt: (maxExclusive: number) => number): T[] {
	const pool = [...candidates];
	const take = Math.min(Math.max(0, Math.floor(count)), pool.length);
	for (let i = 0; i < take; i++) {
		const j = i + randomInt(pool.length - i);
		[pool[i], pool[j]] = [pool[j]!, pool[i]!];
	}
	return pool.slice(0, take);
}

/* ---------------------------------------------------------------- 입력 */

export const giveawayPrizeSchema = z
	.string()
	.trim()
	.min(1, '상품을 입력해 주세요.')
	.max(GIVEAWAY_PRIZE_MAX, `상품은 ${GIVEAWAY_PRIZE_MAX}자까지 쓸 수 있어요.`)
	.refine((text) => !/@(everyone|here)/i.test(text), '@everyone, @here는 쓸 수 없어요.');

export const giveawayWinnerCountSchema = z
	.number()
	.int()
	.min(1, '당첨자는 1명 이상이에요.')
	.max(GIVEAWAY_WINNERS_MAX, `당첨자는 최대 ${GIVEAWAY_WINNERS_MAX}명이에요.`);

const DURATION_UNITS: Record<string, number> = { d: DAY_MS, 일: DAY_MS, h: 60 * 60_000, 시간: 60 * 60_000, m: 60_000, 분: 60_000 };

/** "30m", "2h", "1d12h", "1일 2시간 30분"을 ms로. 형식이 틀리거나 0이면 null */
export function parseGiveawayDuration(text: string): number | null {
	const source = text.trim().toLowerCase();
	if (!source) return null;
	const pattern = /(\d+)\s*(d|h|m|일|시간|분)/gy;
	let total = 0;
	let consumed = 0;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(source)) !== null) {
		total += Number(match[1]) * DURATION_UNITS[match[2]!]!;
		consumed = pattern.lastIndex;
		while (source[consumed] === ' ') {
			consumed++;
			pattern.lastIndex = consumed;
		}
	}
	return consumed === source.length && total > 0 && Number.isSafeInteger(total) ? total : null;
}

/** 마감 시각이 1분 뒤 ~ 30일 안인지. 문제가 있으면 안내 문구, 괜찮으면 null */
export function checkGiveawayEnd(now: Date, endsAt: Date): string | null {
	const lead = endsAt.getTime() - now.getTime();
	if (lead < GIVEAWAY_MIN_DURATION_MS) return '마감은 지금부터 1분 뒤 이후여야 해요.';
	if (lead > GIVEAWAY_MAX_DURATION_MS) return '마감은 30일 안으로 정해 주세요.';
	return null;
}

export const giveawayJobPayloadSchema = z.object({ giveawayId: z.string().min(1).max(64) });
export type GiveawayJobPayload = z.infer<typeof giveawayJobPayloadSchema>;

export function parseGiveawayJobPayload(raw: unknown): GiveawayJobPayload | null {
	const result = giveawayJobPayloadSchema.safeParse(raw);
	return result.success ? result.data : null;
}
