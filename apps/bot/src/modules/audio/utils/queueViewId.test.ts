import { describe, expect, it } from 'vitest';
import { clampQueuePage, encodeQueueViewId, isQueueViewCustomId, parseQueueViewId, QUEUE_VIEW_INDICATOR_ID } from './queueViewId.ts';

const OWNER = '1234567890123456789';
const TOKEN = '123.0123456789abcdef';

describe('queueViewId', () => {
	it('round-trips every action', () => {
		expect(parseQueueViewId(encodeQueueViewId({ action: 'page', ownerId: OWNER, page: 3 }))).toEqual({
			action: 'page',
			ownerId: OWNER,
			page: 3,
			token: null
		});
		expect(parseQueueViewId(encodeQueueViewId({ action: 'sel', ownerId: OWNER, page: 1 }))).toEqual({
			action: 'sel',
			ownerId: OWNER,
			page: 1,
			token: null
		});
		expect(parseQueueViewId(encodeQueueViewId({ action: 'jump', ownerId: OWNER, page: 2, token: TOKEN }))).toEqual({
			action: 'jump',
			ownerId: OWNER,
			page: 2,
			token: TOKEN
		});
		expect(parseQueueViewId(encodeQueueViewId({ action: 'rm', ownerId: OWNER, page: 2, token: TOKEN }))).toEqual({
			action: 'rm',
			ownerId: OWNER,
			page: 2,
			token: TOKEN
		});
	});

	it('encodes a missing selection as a null token', () => {
		const id = encodeQueueViewId({ action: 'rm', ownerId: OWNER, page: 1 });
		expect(id).toBe(`queue:v1:rm:${OWNER}:1:-`);
		expect(parseQueueViewId(id)?.token).toBeNull();
	});

	it('stays within the 100 character custom id limit for the worst case', () => {
		const worst = { ownerId: '9'.repeat(19), page: 9_999_999, token: `99999.${'f'.repeat(16)}` };
		for (const action of ['page', 'sel', 'jump', 'rm'] as const) {
			expect(encodeQueueViewId({ action, ...worst }).length).toBeLessThanOrEqual(100);
		}
		expect(encodeQueueViewId({ action: 'rm', ...worst })).toHaveLength(62);
	});

	it.each([
		'',
		'queue:page:1234567890:2',
		'queue:page:indicator',
		'controller:queue:remove:3.0123456789abcdef',
		'queue:v1:',
		'queue:v1:bogus:1:1',
		'queue:v1:page:abc:1',
		'queue:v1:page:1:abc',
		'queue:v1:page:1:-1',
		'queue:v1:page:1',
		'queue:v1:page:1:2:3',
		'queue:v1:jump:1:1',
		'queue:v1:jump:1:1:ZZ',
		'queue:v1:rm:1:1:1.2:extra',
		'queue:v1:ind'
	])('rejects malformed or legacy id %j', (customId) => {
		expect(parseQueueViewId(customId)).toBeNull();
	});

	it('recognizes queue buttons (including legacy) but not the indicator', () => {
		expect(isQueueViewCustomId('queue:page:123:2')).toBe(true);
		expect(isQueueViewCustomId(`queue:v1:page:${OWNER}:1`)).toBe(true);
		expect(isQueueViewCustomId(QUEUE_VIEW_INDICATOR_ID)).toBe(false);
		expect(isQueueViewCustomId('controller:queue:view')).toBe(false);
	});

	it('clamps pages into range', () => {
		expect(clampQueuePage(0, 5)).toBe(1);
		expect(clampQueuePage(9, 3)).toBe(3);
		expect(clampQueuePage(2, 0)).toBe(1);
		expect(clampQueuePage(2, 5)).toBe(2);
	});
});
