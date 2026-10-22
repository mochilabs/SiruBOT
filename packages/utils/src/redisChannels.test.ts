import { describe, expect, it } from 'vitest';
import { guildIdFromPlayerStateChannel, playerStateChannel, PLAYER_STATE_CHANNEL_PATTERN, redisIdSchema } from './redisChannels.ts';

describe('redisIdSchema', () => {
	it('영문·숫자·_·-만 허용해요 (스노플레이크 포함)', () => {
		expect(redisIdSchema.safeParse('123456789012345678').success).toBe(true);
		expect(redisIdSchema.safeParse('guild_id-1').success).toBe(true);
	});

	it('구분자(:)·공백·경로 조작 문자는 거부해요', () => {
		expect(redisIdSchema.safeParse('a:b').success).toBe(false);
		expect(redisIdSchema.safeParse('a b').success).toBe(false);
		expect(redisIdSchema.safeParse('../etc').success).toBe(false);
		expect(redisIdSchema.safeParse('').success).toBe(false);
		expect(redisIdSchema.safeParse('a'.repeat(33)).success).toBe(false);
	});
});

describe('player state channel builders', () => {
	it('채널명 ↔ guildId 왕복이 성립해요', () => {
		const channel = playerStateChannel('1234567890');
		expect(channel).toBe('sirubot:player:1234567890');
		expect(guildIdFromPlayerStateChannel(channel)).toBe('1234567890');
	});

	it('이 계열 채널이 아니면 null이에요', () => {
		expect(guildIdFromPlayerStateChannel('sirubot:bot-profile:state:1')).toBeNull();
		expect(guildIdFromPlayerStateChannel('sirubot:player:')).toBe('');
	});

	it('패턴 구독용 접미사가 붙어요', () => {
		expect(PLAYER_STATE_CHANNEL_PATTERN).toBe('sirubot:player:*');
	});
});
