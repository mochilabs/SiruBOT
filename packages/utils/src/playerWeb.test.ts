import { describe, expect, it } from 'vitest';
import {
	playerWebControlActionSchema,
	playerWebControlRequestSchema,
	playerWebPlayRequestSchema,
	playerWebSearchRequestSchema,
	playerWebResponseSchema,
	playerWebTrackSchema,
	playerWebVoiceContextRequestSchema,
	playerVoiceContextSchema
} from './playerWeb.ts';

const REQUEST_ID = 'b3c1e7a4-9f2d-4c8b-a6e0-1d5f7b9c3a11';
const VALID_BASE = { requestId: REQUEST_ID, guildId: '123456789012345678', userId: '987654321098765432' };

function sampleTrack() {
	return {
		title: 'Never Gonna Give You Up',
		author: 'Rick Astley',
		durationMs: 213_000,
		artworkUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
		uri: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
		sourceName: 'youtube',
		isStream: false
	};
}

describe('playerWeb request contracts', () => {
	it('rejects a non-uuid requestId and an unknown kind on the base schema', () => {
		expect(playerWebSearchRequestSchema.safeParse({ ...VALID_BASE, requestId: 'not-a-uuid', kind: 'search', query: 'adele' }).success).toBe(
			false
		);
		expect(playerWebSearchRequestSchema.safeParse({ ...VALID_BASE, kind: 'members', query: 'adele' }).success).toBe(false);
	});

	it('accepts a search request with a bounded query', () => {
		const result = playerWebSearchRequestSchema.safeParse({ ...VALID_BASE, kind: 'search', query: '  adele hello  ' });
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.userId).toBe(VALID_BASE.userId);
	});

	it('rejects a search request with an empty or too-long query', () => {
		expect(playerWebSearchRequestSchema.safeParse({ ...VALID_BASE, kind: 'search', query: '' }).success).toBe(false);
		expect(playerWebSearchRequestSchema.safeParse({ ...VALID_BASE, kind: 'search', query: 'a'.repeat(201) }).success).toBe(false);
	});

	it('rejects guildId/userId with Redis 키 구분자·공백 (키 주입 방지)', () => {
		for (const bad of ['guild:1', 'a b', 'x/y', '', '   ']) {
			expect(playerWebSearchRequestSchema.safeParse({ ...VALID_BASE, guildId: bad, kind: 'search', query: 'x' }).success).toBe(false);
			expect(playerWebSearchRequestSchema.safeParse({ ...VALID_BASE, userId: bad, kind: 'search', query: 'x' }).success).toBe(false);
		}
		expect(playerWebSearchRequestSchema.safeParse({ ...VALID_BASE, guildId: 'guild-1_2', kind: 'search', query: 'x' }).success).toBe(true);
	});

	it('requires a well-formed url for the play request', () => {
		expect(
			playerWebPlayRequestSchema.safeParse({ ...VALID_BASE, kind: 'play', uri: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }).success
		).toBe(true);
		expect(playerWebPlayRequestSchema.safeParse({ ...VALID_BASE, kind: 'play', uri: 'not-a-url' }).success).toBe(false);
	});

	it('rejects non-http(s) play uris (Lavalink 측 내부 fetch SSRF 방지)', () => {
		// 스킴을 http/https로 제한해요 — file:, data:, ftp: 등은 봇을 거쳐 Lavalink가 가져올 수 있어요.
		for (const uri of ['file:///etc/passwd', 'data:text/plain,hi', 'ftp://example.com/x']) {
			expect(playerWebPlayRequestSchema.safeParse({ ...VALID_BASE, kind: 'play', uri }).success).toBe(false);
		}
		expect(playerWebPlayRequestSchema.safeParse({ ...VALID_BASE, kind: 'play', uri: 'http://example.com/track' }).success).toBe(true);
	});

	it('accepts every control action and requires value only for volume', () => {
		for (const action of ['volume' as const, 'pause' as const, 'resume' as const, 'skip' as const, 'stop' as const, 'repeat' as const]) {
			expect(playerWebControlActionSchema.safeParse(action).success).toBe(true);
		}
		expect(playerWebControlRequestSchema.safeParse({ ...VALID_BASE, kind: 'control', action: 'volume', value: 80 }).success).toBe(true);
		expect(playerWebControlRequestSchema.safeParse({ ...VALID_BASE, kind: 'control', action: 'pause' }).success).toBe(true);
		expect(playerWebControlRequestSchema.safeParse({ ...VALID_BASE, kind: 'control', action: 'repeat' }).success).toBe(true);
		expect(playerWebControlRequestSchema.safeParse({ ...VALID_BASE, kind: 'control', action: 'volume' }).success).toBe(false);
		expect(playerWebControlRequestSchema.safeParse({ ...VALID_BASE, kind: 'control', action: 'volume', value: 151 }).success).toBe(false);
	});

	it('rejects a control request with an unknown action', () => {
		expect(playerWebControlRequestSchema.safeParse({ ...VALID_BASE, kind: 'control', action: 'shuffle' }).success).toBe(false);
	});
});

describe('playerWeb response contract', () => {
	it('roundtrips a search response with track summaries', () => {
		const result = playerWebResponseSchema.safeParse({
			requestId: REQUEST_ID,
			guildId: VALID_BASE.guildId,
			kind: 'search',
			tracks: [sampleTrack()]
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.tracks?.[0]?.title).toBe('Never Gonna Give You Up');
			expect(result.data.error).toBeUndefined();
		}
	});

	it('accepts an error-only response carrying a korean message', () => {
		const result = playerWebResponseSchema.safeParse({
			requestId: REQUEST_ID,
			guildId: VALID_BASE.guildId,
			kind: 'play',
			error: '음성 채널에 먼저 접속해 주세요.'
		});
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.error).toBe('음성 채널에 먼저 접속해 주세요.');
	});

	it('roundtrips a voice-context response and rejects bad shapes', () => {
		const result = playerWebResponseSchema.safeParse({
			requestId: REQUEST_ID,
			guildId: VALID_BASE.guildId,
			kind: 'voice-context',
			voice: { inVoice: true, voiceChannelName: '음악', canControl: true }
		});
		expect(result.success).toBe(true);

		expect(playerVoiceContextSchema.safeParse({ inVoice: 'yes', voiceChannelName: null, canControl: false }).success).toBe(false);
		expect(playerWebTrackSchema.safeParse(null as unknown).success).toBe(false);
	});

	it('rejects more than five tracks', () => {
		const result = playerWebResponseSchema.safeParse({
			requestId: REQUEST_ID,
			guildId: VALID_BASE.guildId,
			kind: 'search',
			tracks: Array.from({ length: 6 }, sampleTrack)
		});
		expect(result.success).toBe(false);
	});

	it('rejects a non-uuid requestId', () => {
		expect(playerWebResponseSchema.safeParse({ requestId: 'not-a-uuid', guildId: VALID_BASE.guildId, kind: 'search' }).success).toBe(false);
	});
});

describe('playerWeb voice-context request contract', () => {
	it('strips unknown payload fields beyond the base shape (loose contract)', () => {
		const result = playerWebVoiceContextRequestSchema.safeParse({ ...VALID_BASE, kind: 'voice-context', query: 'adele' });
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.kind).toBe('voice-context');
	});
});
