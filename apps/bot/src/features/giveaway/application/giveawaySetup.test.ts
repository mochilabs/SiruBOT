import { describe, expect, it } from 'vitest';
import {
	emptyGiveawaySetup,
	missingSetupFields,
	parseSetupDays,
	parseSetupEnd,
	parseSetupPrize,
	parseSetupWinners,
	resolveSetupEnd,
	setupConditions
} from './giveawaySetup.ts';
import { giveawaySetupView } from '../discord/views/giveawaySetupView.ts';
import { giveawaySetupId } from '../discord/customIds.ts';

const CHANNEL = '111111111111111111';

describe('giveaway setup state', () => {
	it('needs a prize and an end before starting', () => {
		const state = emptyGiveawaySetup(CHANNEL);
		expect(missingSetupFields(state)).toEqual(['상품', '마감']);
		state.prize = '기프티콘';
		state.end = { kind: 'relative', ms: 3_600_000 };
		expect(missingSetupFields(state)).toEqual([]);
	});

	it('resolves relative ends from the moment of starting', () => {
		const now = new Date('2026-01-01T00:00:00Z');
		expect(resolveSetupEnd({ kind: 'relative', ms: 3_600_000 }, now)).toEqual(new Date('2026-01-01T01:00:00Z'));
		const at = new Date('2026-02-01T00:00:00Z');
		expect(resolveSetupEnd({ kind: 'absolute', at }, now)).toBe(at);
		expect(resolveSetupEnd(null, now)).toBeNull();
	});

	it('accepts a duration or a KST time for the end', () => {
		expect(parseSetupEnd('1d12h')).toEqual({ ok: true, value: { kind: 'relative', ms: 36 * 3_600_000 } });
		const absolute = parseSetupEnd('2026-12-25 21:00');
		expect(absolute.ok && absolute.value.kind === 'absolute' && absolute.value.at.toISOString()).toBe('2026-12-25T12:00:00.000Z');
		expect(parseSetupEnd('내일').ok).toBe(false);
		expect(parseSetupEnd('2026-13-45 99:99').ok).toBe(false);
	});

	it('validates prize, winners and day inputs', () => {
		expect(parseSetupPrize('  선물  ')).toEqual({ ok: true, value: '선물' });
		expect(parseSetupPrize('   ').ok).toBe(false);
		expect(parseSetupWinners('3')).toEqual({ ok: true, value: 3 });
		expect(parseSetupWinners('0').ok).toBe(false);
		expect(parseSetupWinners('abc').ok).toBe(false);
		expect(parseSetupDays('', '가입 일수')).toEqual({ ok: true, value: null });
		expect(parseSetupDays('30', '가입 일수')).toEqual({ ok: true, value: 30 });
		expect(parseSetupDays('-1', '가입 일수').ok).toBe(false);
	});

	it('builds conditions from the picked roles and days', () => {
		const state = {
			...emptyGiveawaySetup(CHANNEL),
			requiredRoleIds: ['222222222222222222'],
			blockedRoleIds: ['333333333333333333'],
			minJoinDays: 7
		};
		expect(setupConditions(state).map((c) => c.type)).toEqual(['requiredRoles', 'blockedRoles', 'minJoinDays']);
	});
});

describe('giveaway setup view', () => {
	const customIds = (state: ReturnType<typeof emptyGiveawaySetup>) =>
		JSON.parse(JSON.stringify(giveawaySetupView(state).components[0])).components.flatMap(
			(c: { components?: { custom_id: string; disabled?: boolean }[] }) => c.components ?? []
		) as { custom_id: string; disabled?: boolean }[];

	it('renders every control with a decodable custom id', () => {
		const ids = customIds(emptyGiveawaySetup(CHANNEL));
		expect(ids.map((c) => giveawaySetupId.decode(c.custom_id)?.action)).toEqual([
			'prize',
			'end',
			'days',
			'match',
			'quick',
			'channel',
			'required',
			'blocked',
			'start',
			'cancel'
		]);
	});

	it('disables start until prize and end are set', () => {
		const state = emptyGiveawaySetup(CHANNEL);
		const start = () => customIds(state).find((c) => giveawaySetupId.decode(c.custom_id)?.action === 'start')!;
		expect(start().disabled).toBe(true);
		state.prize = '선물';
		state.end = { kind: 'relative', ms: 3_600_000 };
		expect(start().disabled).toBeFalsy();
	});
});
