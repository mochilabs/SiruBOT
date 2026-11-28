import { describe, expect, it } from 'vitest';
import { computeChannelToggle, isChannelToggleEnabled, normalizeAiMode, normalizeChatToolMode, normalizeTtsMode } from './types.ts';

describe('모드 정규화', () => {
	it('AI 채팅은 잘못된 값이면 all로, TTS·채팅 유틸은 off로 폴백해요', () => {
		expect(normalizeAiMode('all')).toBe('all');
		expect(normalizeAiMode('bogus')).toBe('all');
		expect(normalizeTtsMode('channels')).toBe('channels');
		expect(normalizeTtsMode('bogus')).toBe('off');
		expect(normalizeChatToolMode('off')).toBe('off');
		expect(normalizeChatToolMode('bogus')).toBe('off');
	});
});

describe('채널 토글 판정', () => {
	it('isChannelToggleEnabled는 채널 목록 규칙을 따라요', () => {
		expect(isChannelToggleEnabled({ mode: 'off', channelIds: ['a'] }, 'a')).toBe(false);
		expect(isChannelToggleEnabled({ mode: 'all', channelIds: [] }, 'a')).toBe(true);
		expect(isChannelToggleEnabled({ mode: 'channels', channelIds: ['a'] }, 'a')).toBe(true);
		expect(isChannelToggleEnabled({ mode: 'channels', channelIds: ['a'] }, 'b')).toBe(false);
		expect(isChannelToggleEnabled({ mode: 'channels', channelIds: ['b'] }, 'b')).toBe(true);
		expect(isChannelToggleEnabled({ mode: 'channels', channelIds: ['b'] }, 'a')).toBe(false);
	});
});

describe('computeChannelToggle', () => {
	it('켜기: off면 channels + [채널], channels면 목록에 추가하고 중복은 없어요', () => {
		expect(computeChannelToggle({ mode: 'off', channelIds: [] }, 'c1', true, [])).toEqual({ mode: 'channels', channelIds: ['c1'] });
		expect(computeChannelToggle({ mode: 'channels', channelIds: ['c1'] }, 'c1', true, [])).toEqual({ mode: 'channels', channelIds: ['c1'] });
		expect(computeChannelToggle({ mode: 'channels', channelIds: ['c1'] }, 'c2', true, [])).toEqual({
			mode: 'channels',
			channelIds: ['c1', 'c2']
		});
	});

	it('켜기: all는 이미 전체 허용이라 그대로예요', () => {
		expect(computeChannelToggle({ mode: 'all', channelIds: [] }, 'c1', true, ['c1', 'c2'])).toEqual({ mode: 'all', channelIds: [] });
	});

	it('끄기: channels면 목록에서 제거하고 비면 off가 돼요', () => {
		expect(computeChannelToggle({ mode: 'channels', channelIds: ['c1', 'c2'] }, 'c1', false, [])).toEqual({
			mode: 'channels',
			channelIds: ['c2']
		});
		expect(computeChannelToggle({ mode: 'channels', channelIds: ['c1'] }, 'c1', false, [])).toEqual({ mode: 'off', channelIds: [] });
	});

	it('끄기: all이면 남은 텍스트 채널로 승계하고 없으면 off예요', () => {
		expect(computeChannelToggle({ mode: 'all', channelIds: [] }, 'c2', false, ['c1', 'c2', 'c3'])).toEqual({
			mode: 'channels',
			channelIds: ['c1', 'c3']
		});
		expect(computeChannelToggle({ mode: 'all', channelIds: [] }, 'c1', false, ['c1'])).toEqual({ mode: 'off', channelIds: [] });
	});

	it('끄기: off는 그대로예요', () => {
		expect(computeChannelToggle({ mode: 'off', channelIds: [] }, 'c1', false, ['c1'])).toEqual({ mode: 'off', channelIds: [] });
	});
});
