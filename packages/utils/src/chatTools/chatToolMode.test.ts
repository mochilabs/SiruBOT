import { describe, expect, it } from 'vitest';

import { CHAT_TOOL_MODES, normalizeChatToolMode } from './chatToolMode.ts';

describe('채팅 유틸 모드 단일 계약', () => {
	it('all / channels / off 세 값만 허용해요', () => {
		expect(CHAT_TOOL_MODES).toEqual(['all', 'channels', 'off']);
	});

	it('유효한 모드는 그대로 유지해요', () => {
		for (const mode of CHAT_TOOL_MODES) {
			expect(normalizeChatToolMode(mode)).toBe(mode);
		}
	});

	it('잘못된·비어 있는 값은 기본값(off)으로 되돌려요 — 봇·대시보드 기본값이 같아야 해요', () => {
		expect(normalizeChatToolMode('bogus')).toBe('off');
		expect(normalizeChatToolMode('')).toBe('off');
		expect(normalizeChatToolMode(null)).toBe('off');
		expect(normalizeChatToolMode(undefined)).toBe('off');
	});
});
