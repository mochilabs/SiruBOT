import { describe, expect, it } from 'vitest';
import {
	STARBOARD_IGNORED_CHANNELS_MAX,
	STARBOARD_SETTINGS_DEFAULTS,
	starboardEmojiMatches,
	starboardSettingsPatchSchema,
	starboardSettingsSchema
} from './starboard.ts';

const ID = '123456789012345678';

describe('starboardSettingsSchema', () => {
	it('기본값이 스키마를 통과해요', () => {
		expect(starboardSettingsSchema.parse(STARBOARD_SETTINGS_DEFAULTS)).toEqual(STARBOARD_SETTINGS_DEFAULTS);
	});

	it('기준 수는 1~50이에요', () => {
		expect(starboardSettingsPatchSchema.safeParse({ threshold: 0 }).success).toBe(false);
		expect(starboardSettingsPatchSchema.safeParse({ threshold: 51 }).success).toBe(false);
		expect(starboardSettingsPatchSchema.safeParse({ threshold: 1.5 }).success).toBe(false);
		expect(starboardSettingsPatchSchema.safeParse({ threshold: 1 }).success).toBe(true);
		expect(starboardSettingsPatchSchema.safeParse({ threshold: 50 }).success).toBe(true);
	});

	it('무시할 채널은 최대 25개예요', () => {
		const ok = Array.from({ length: STARBOARD_IGNORED_CHANNELS_MAX }, () => ID);
		expect(starboardSettingsPatchSchema.safeParse({ ignoredChannelIds: ok }).success).toBe(true);
		expect(starboardSettingsPatchSchema.safeParse({ ignoredChannelIds: [...ok, ID] }).success).toBe(false);
		expect(starboardSettingsPatchSchema.safeParse({ ignoredChannelIds: ['abc'] }).success).toBe(false);
	});

	it('이모지는 유니코드 또는 커스텀 마크업만 받아요', () => {
		expect(starboardSettingsPatchSchema.safeParse({ emoji: '🌟' }).success).toBe(true);
		expect(starboardSettingsPatchSchema.safeParse({ emoji: `<:star:${ID}>` }).success).toBe(true);
		expect(starboardSettingsPatchSchema.safeParse({ emoji: 'star' }).success).toBe(false);
	});

	it('patch는 일부 필드만 받고 알 수 없는 값은 막지 않고 버려요', () => {
		expect(starboardSettingsPatchSchema.parse({ channelId: null })).toEqual({ channelId: null });
	});
});

describe('starboardEmojiMatches', () => {
	it('유니코드는 이름으로, 변형 선택자는 무시하고 비교해요', () => {
		expect(starboardEmojiMatches('⭐', { id: null, name: '⭐' })).toBe(true);
		expect(starboardEmojiMatches('❤️', { id: null, name: '❤' })).toBe(true);
		expect(starboardEmojiMatches('⭐', { id: null, name: '🌟' })).toBe(false);
	});

	it('커스텀 이모지는 id로 비교해요', () => {
		expect(starboardEmojiMatches(`<:star:${ID}>`, { id: ID, name: 'other' })).toBe(true);
		expect(starboardEmojiMatches(`<:star:${ID}>`, { id: '999999999999999999', name: 'star' })).toBe(false);
		expect(starboardEmojiMatches('⭐', { id: ID, name: '⭐' })).toBe(false);
	});
});
