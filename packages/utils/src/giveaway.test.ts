import { describe, expect, it } from 'vitest';
import {
	buildGiveawayConditions,
	checkGiveawayEnd,
	describeGiveawayCondition,
	drawWinners,
	evaluateGiveawayConditions,
	parseGiveawayDuration,
	parseGiveawayRequirements,
	type GiveawayCondition,
	type GiveawayMemberFacts
} from './giveaway.js';

const NOW = new Date('2026-11-22T00:00:00Z');
const ROLE_A = '100000000000000001';
const ROLE_B = '100000000000000002';
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const member = (over: Partial<GiveawayMemberFacts> = {}): GiveawayMemberFacts => ({
	roleIds: [],
	joinedAt: daysAgo(30),
	accountCreatedAt: daysAgo(400),
	...over
});

describe('evaluateGiveawayConditions', () => {
	it('조건이 없으면 누구나 통과해요', () => {
		expect(evaluateGiveawayConditions([], member(), NOW)).toEqual({ ok: true, reasons: [] });
	});

	it('requiredRoles any는 하나만, all은 모두 있어야 해요', () => {
		const any: GiveawayCondition = { type: 'requiredRoles', roleIds: [ROLE_A, ROLE_B], match: 'any' };
		const all: GiveawayCondition = { type: 'requiredRoles', roleIds: [ROLE_A, ROLE_B], match: 'all' };
		expect(evaluateGiveawayConditions([any], member({ roleIds: [ROLE_B] }), NOW).ok).toBe(true);
		expect(evaluateGiveawayConditions([any], member(), NOW).ok).toBe(false);
		expect(evaluateGiveawayConditions([all], member({ roleIds: [ROLE_B] }), NOW)).toMatchObject({ ok: false });
		expect(evaluateGiveawayConditions([all], member({ roleIds: [ROLE_A, ROLE_B] }), NOW).ok).toBe(true);
	});

	it('blockedRoles가 하나라도 있으면 막아요', () => {
		const c: GiveawayCondition = { type: 'blockedRoles', roleIds: [ROLE_A] };
		expect(evaluateGiveawayConditions([c], member({ roleIds: [ROLE_A] }), NOW).ok).toBe(false);
		expect(evaluateGiveawayConditions([c], member({ roleIds: [ROLE_B] }), NOW).ok).toBe(true);
	});

	it('minJoinDays는 경계(정확히 N일)를 통과시키고 가입 시각을 모르면 막아요', () => {
		const c: GiveawayCondition = { type: 'minJoinDays', days: 7 };
		expect(evaluateGiveawayConditions([c], member({ joinedAt: daysAgo(7) }), NOW).ok).toBe(true);
		expect(evaluateGiveawayConditions([c], member({ joinedAt: new Date(daysAgo(7).getTime() + 1) }), NOW).ok).toBe(false);
		expect(evaluateGiveawayConditions([c], member({ joinedAt: null }), NOW).ok).toBe(false);
	});

	it('minAccountAgeDays는 계정 나이를 봐요', () => {
		const c: GiveawayCondition = { type: 'minAccountAgeDays', days: 30 };
		expect(evaluateGiveawayConditions([c], member({ accountCreatedAt: daysAgo(10) }), NOW)).toMatchObject({ ok: false });
		expect(evaluateGiveawayConditions([c], member({ accountCreatedAt: daysAgo(31) }), NOW).ok).toBe(true);
	});

	it('여러 조건은 모두 통과해야 하고 이유를 전부 모아요', () => {
		const conditions: GiveawayCondition[] = [
			{ type: 'requiredRoles', roleIds: [ROLE_A], match: 'any' },
			{ type: 'minJoinDays', days: 100 }
		];
		const result = evaluateGiveawayConditions(conditions, member(), NOW);
		expect(result.ok).toBe(false);
		expect(result.reasons).toHaveLength(2);
	});
});

describe('requirements 파싱과 조립', () => {
	it('올바른 JSON은 받고 깨진 것·알 수 없는 type은 null이에요', () => {
		expect(parseGiveawayRequirements({ version: 1, conditions: [{ type: 'minJoinDays', days: 3 }] })).not.toBeNull();
		expect(parseGiveawayRequirements({ version: 1, conditions: [{ type: 'future', x: 1 }] })).toBeNull();
		expect(parseGiveawayRequirements({ version: 1, conditions: [{ type: 'minJoinDays', days: 0 }] })).toBeNull();
		expect(parseGiveawayRequirements(null)).toBeNull();
	});

	it('requiredRoles의 match 기본값은 any예요', () => {
		const parsed = parseGiveawayRequirements({ version: 1, conditions: [{ type: 'requiredRoles', roleIds: [ROLE_A] }] });
		expect(parsed?.conditions[0]).toMatchObject({ match: 'any' });
	});

	it('buildGiveawayConditions는 빈 값을 건너뛰고 역할 중복을 없애요', () => {
		expect(buildGiveawayConditions({})).toEqual([]);
		expect(
			buildGiveawayConditions({ requiredRoleIds: [ROLE_A, ROLE_A], requiredMatch: 'all', blockedRoleIds: [ROLE_B], minJoinDays: 3 })
		).toEqual([
			{ type: 'requiredRoles', roleIds: [ROLE_A], match: 'all' },
			{ type: 'blockedRoles', roleIds: [ROLE_B] },
			{ type: 'minJoinDays', days: 3 }
		]);
	});

	it('describeGiveawayCondition이 한 줄 문구를 만들어요', () => {
		expect(describeGiveawayCondition({ type: 'minJoinDays', days: 7 })).toBe('서버 가입 7일 이상');
	});
});

describe('drawWinners', () => {
	it('중복 없이 count명을 뽑아요', () => {
		const winners = drawWinners([1, 2, 3, 4, 5], 3, (max) => max - 1);
		expect(new Set(winners).size).toBe(3);
		expect(winners).toEqual([5, 1, 2]);
	});

	it('후보보다 많이 달라면 전부, 0 이하면 빈 배열이에요', () => {
		expect(drawWinners([1, 2], 5, () => 0).sort()).toEqual([1, 2]);
		expect(drawWinners([1, 2], 0, () => 0)).toEqual([]);
		expect(drawWinners([], 3, () => 0)).toEqual([]);
	});

	it('원본 배열을 바꾸지 않아요', () => {
		const input = [1, 2, 3];
		drawWinners(input, 2, () => 1);
		expect(input).toEqual([1, 2, 3]);
	});

	it('난수가 균등하면 모든 후보가 비슷한 빈도로 뽑혀요', () => {
		const counts = [0, 0, 0, 0];
		let state = 12345;
		const rng = (max: number) => {
			state = (state * 1103515245 + 12345) & 0x7fffffff;
			return Math.floor((state / 0x80000000) * max);
		};
		for (let i = 0; i < 4000; i++) counts[drawWinners([0, 1, 2, 3], 1, rng)[0]!]!++;
		for (const c of counts) expect(c).toBeGreaterThan(800);
	});
});

describe('입력 검증', () => {
	it('기간 문자열을 해석해요', () => {
		expect(parseGiveawayDuration('30m')).toBe(30 * 60_000);
		expect(parseGiveawayDuration('1d12h')).toBe(36 * 3_600_000);
		expect(parseGiveawayDuration('1일 2시간 30분')).toBe(26.5 * 3_600_000);
		for (const bad of ['', 'abc', '10', '0m', '5x', '1h 가']) expect(parseGiveawayDuration(bad)).toBeNull();
	});

	it('마감은 1분 뒤 ~ 30일 안이에요', () => {
		const at = (ms: number) => new Date(NOW.getTime() + ms);
		expect(checkGiveawayEnd(NOW, at(30_000))).not.toBeNull();
		expect(checkGiveawayEnd(NOW, at(60_000))).toBeNull();
		expect(checkGiveawayEnd(NOW, at(30 * 86_400_000))).toBeNull();
		expect(checkGiveawayEnd(NOW, at(30 * 86_400_000 + 1))).not.toBeNull();
	});
});
