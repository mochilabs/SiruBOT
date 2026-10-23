import { TextDisplayBuilder } from 'discord.js';
import { describe, expect, it } from 'vitest';

import { finalPayload } from './chatView.ts';

function chunkContents(text: string): string[] {
	return finalPayload(text).components.map((component) => (component instanceof TextDisplayBuilder ? (component.toJSON().content ?? '') : ''));
}

describe('finalPayload 청크 분할', () => {
	it('3900자 이하는 한 조각으로 그대로 보여요', () => {
		expect(chunkContents('짧은 답장')).toEqual(['짧은 답장']);
		expect(chunkContents('x'.repeat(3_900))).toHaveLength(1);
	});

	it('3900자를 넘으면 줄 경계에서 다음 조각으로 넘어가요', () => {
		const chunks = chunkContents('x'.repeat(3_901));
		expect(chunks).toHaveLength(2);
		expect(chunks[0]).toHaveLength(3_900);
		expect(chunks[1]).toBe('x');
	});

	it('코드펜스 중간에서 자르지 않고 펜스 앞에서 끊어요', () => {
		const chunks = chunkContents(`${'a'.repeat(3_000)}\`\`\`${'b'.repeat(5_000)}`);
		expect(chunks[0]).toBe('a'.repeat(3_000));
		expect(chunks[1]?.startsWith('```')).toBe(true);
	});

	it('4조각을 넘는 긴 답장은 마지막 조각에 잘림 안내를 붙여요', () => {
		const chunks = chunkContents('y'.repeat(20_000));
		expect(chunks).toHaveLength(4);
		expect(chunks.every((chunk) => chunk.length <= 4_000)).toBe(true);
		expect(chunks[3]).toContain('답장이 너무 길어 잘렸어요');
	});
});
