import { describe, expect, it } from 'vitest';
import { emojiProgressView, type EmojiProgressViewState } from './emojiProgress.ts';

const base: EmojiProgressViewState = {
	description: '선글라스 낀 고양이',
	fromImage: false,
	readDone: false,
	readPrompt: null,
	queueAhead: null,
	drawing: null,
	hasPreview: false
};
const text = (state: EmojiProgressViewState) => JSON.stringify(emojiProgressView(state).toJSON());

describe('emojiProgressView', () => {
	it('walks through reading, queueing and drawing', () => {
		expect(text(base)).toContain('설명을 읽는 중');
		expect(text({ ...base, fromImage: true })).toContain('이미지를 살펴보는 중');

		const read = text({ ...base, readDone: true, readPrompt: 'cat wearing sunglasses' });
		expect(read).toContain('설명을 읽었어요 · `cat wearing sunglasses`');
		expect(read).toContain('붓을 준비하는 중');

		expect(text({ ...base, readDone: true, queueAhead: 2 })).toContain('차례를 기다리는 중…** 앞에 2개');

		const drawing = text({ ...base, readDone: true, drawing: { step: 8, total: 16 }, hasPreview: true });
		expect(drawing).toContain('픽셀을 찍는 중…** ` 50%`');
		expect(drawing).not.toContain('차례를 기다리는');
		expect(drawing).toContain('attachment://moji-preview.png');
	});

	it('leaves out the reading step on reroll and the gallery without a preview', () => {
		const reroll = text({ ...base, readDone: true, reroll: true });
		expect(reroll).not.toContain('읽었어요');
		expect(reroll).toContain('붓을 준비하는 중');
		expect(reroll).not.toContain('attachment://');
	});
});
