import { describe, expect, it } from 'vitest';
import { playerStateResponseSchema, playerStateSchema } from './playerState.ts';

function sampleState() {
	return {
		guildId: '123',
		playing: true,
		paused: false,
		positionMs: 42_000,
		durationMs: 180_000,
		trackTitle: '곡 제목',
		trackAuthor: '아티스트',
		artworkUrl: null,
		isStream: false,
		queue: [{ title: 't', author: 'a', durationMs: 1_000, artworkUrl: null, isStream: false, requesterName: '유저' }],
		queueLength: 1,
		repeatMode: 'off' as const,
		volume: 10,
		requesterName: '유저',
		sourceName: 'youtube',
		updatedAt: 1_000
	};
}

describe('playerState schema contract', () => {
	it('accepts the publisher payload shape and keeps fields', () => {
		const result = playerStateSchema.safeParse(sampleState());
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.queue[0]?.requesterName).toBe('유저');
	});

	it('rejects an unknown repeat mode and a wrong queue item shape', () => {
		expect(playerStateSchema.safeParse({ ...sampleState(), repeatMode: 'all' }).success).toBe(false);
		expect(playerStateSchema.safeParse({ ...sampleState(), queue: [{ title: 1 }] }).success).toBe(false);
	});
});

describe('playerStateResponse schema contract', () => {
	it('adds ageMs and stale on top of the snapshot', () => {
		const result = playerStateResponseSchema.safeParse({ ...sampleState(), ageMs: 1_200, stale: false });
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.stale).toBe(false);
	});

	it('rejects without the hub-added fields', () => {
		expect(playerStateResponseSchema.safeParse(sampleState()).success).toBe(false);
	});
});
