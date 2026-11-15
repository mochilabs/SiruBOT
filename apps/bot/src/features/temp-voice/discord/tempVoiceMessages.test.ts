import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { tempVoiceMessages } from './tempVoiceMessages.ts';

describe('tempVoiceMessages (Discord 렌더링)', () => {
	it('notice는 강조 색과 함께 Components V2 안내 블록을 만들어요', () => {
		const payload = tempVoiceMessages.notice('실패했어요', 0xff0000);
		expect(payload.flags).toEqual([MessageFlags.IsComponentsV2]);
		expect(payload.components).toHaveLength(1);
		const json = JSON.stringify(payload.components![0]);
		expect(json).toContain('실패했어요');
		expect(json).toContain(String(0xff0000));
	});
});
