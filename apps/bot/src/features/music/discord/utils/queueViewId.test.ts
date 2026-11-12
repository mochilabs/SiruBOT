import { describe, expect, it } from 'vitest';
import { clampQueuePage, decodeQueueButtonId, decodeQueueSelectId, queueViewId, QUEUE_VIEW_INDICATOR_ID } from './queueViewId.ts';

const OWNER = '1234567890123456789';
const TOKEN = '123.0123456789abcdef';

describe('queueViewId', () => {
	it('round-trips every action', () => {
		expect(queueViewId.decode(queueViewId.encode('page', { ownerId: OWNER, page: 3 }))).toEqual({ action: 'page', ownerId: OWNER, page: 3 });
		expect(queueViewId.decode(queueViewId.encode('sel', { ownerId: OWNER, page: 1 }))).toEqual({ action: 'sel', ownerId: OWNER, page: 1 });
		expect(queueViewId.decode(queueViewId.encode('jump', { ownerId: OWNER, page: 2, token: TOKEN }))).toEqual({
			action: 'jump',
			ownerId: OWNER,
			page: 2,
			token: TOKEN
		});
		expect(queueViewId.decode(queueViewId.encode('rm', { ownerId: OWNER, page: 2, token: TOKEN }))).toEqual({
			action: 'rm',
			ownerId: OWNER,
			page: 2,
			token: TOKEN
		});
	});

	it('encodes a missing selection as a null token', () => {
		const id = queueViewId.encode('rm', { ownerId: OWNER, page: 1, token: null });
		expect(id).toBe(`queue:v1:rm:${OWNER}:1:-`);
		expect(queueViewId.decode(id)).toMatchObject({ token: null });
	});

	it('stays within the 100 character custom id limit for the worst case', () => {
		const worst = { ownerId: '9'.repeat(20), page: 9_999_999, token: `99999.${'f'.repeat(16)}` };
		for (const action of ['page', 'sel', 'jump', 'rm'] as const) {
			expect(queueViewId.encode(action, worst as never).length).toBeLessThanOrEqual(100);
		}
	});

	it.each([
		'',
		'queue:page:1234567890:2',
		'queue:page:indicator',
		'controller:v1:queue:remove:3.0123456789abcdef',
		'queue:v1:',
		'queue:v1:bogus:1:1',
		'queue:v1:page:abc:1',
		'queue:v1:page:1:abc',
		'queue:v2:page:1234567890123456789:1',
		`queue:v1:page:${OWNER}:-1`,
		`queue:v1:page:${OWNER}`,
		`queue:v1:page:${OWNER}:2:3`,
		`queue:v1:jump:${OWNER}:1`,
		`queue:v1:jump:${OWNER}:1:ZZ:`,
		`queue:v1:rm:${OWNER}:1:1.2:extra`
	])('rejects malformed or legacy id %j', (customId) => {
		expect(queueViewId.decode(customId)).toBeNull();
	});

	it('routes ids to the button or select decoder, never both, and ignores the indicator', () => {
		const page = queueViewId.encode('page', { ownerId: OWNER, page: 1 });
		const sel = queueViewId.encode('sel', { ownerId: OWNER, page: 1 });
		expect(decodeQueueButtonId(page)).not.toBeNull();
		expect(decodeQueueSelectId(page)).toBeNull();
		expect(decodeQueueSelectId(sel)).not.toBeNull();
		expect(decodeQueueButtonId(sel)).toBeNull();
		expect(decodeQueueButtonId(QUEUE_VIEW_INDICATOR_ID)).toBeNull();
		expect(decodeQueueSelectId(QUEUE_VIEW_INDICATOR_ID)).toBeNull();
		expect(QUEUE_VIEW_INDICATOR_ID).toBe('queue:v1:ind');
	});

	it('clamps pages into range', () => {
		expect(clampQueuePage(0, 5)).toBe(1);
		expect(clampQueuePage(9, 3)).toBe(3);
		expect(clampQueuePage(2, 0)).toBe(1);
		expect(clampQueuePage(2, 5)).toBe(2);
	});
});
