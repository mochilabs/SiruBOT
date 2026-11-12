import { describe, expect, it } from 'vitest';
import { findMessagesToPurge } from './purgeMessages.ts';

describe('대상을 지정한 메시지 청소', () => {
	it('최근 N개에서 멈추지 않고 대상의 메시지를 N개 찾아요', async () => {
		const now = Date.now();
		const pages = [
			Array.from({ length: 100 }, (_, i) => ({ id: String(i), author: { id: i === 0 ? 'target' : 'other' }, createdTimestamp: now })),
			[{ id: 'next', author: { id: 'target' }, createdTimestamp: now }]
		];
		const result = await findMessagesToPurge(async () => pages.shift() ?? [], 2, 'target', now);
		expect(result.messages.map((message) => message.id)).toEqual(['0', 'next']);
	});
	it('14일이 지난 메시지는 포함하지 않아요', async () => {
		const now = Date.now();
		const result = await findMessagesToPurge(
			async () => [{ id: 'old', author: { id: 'target' }, createdTimestamp: now - 14 * 86400_000 }],
			1,
			'target',
			now
		);
		expect(result.messages).toEqual([]);
	});
});
