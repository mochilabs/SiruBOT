import { describe, expect, it, vi } from 'vitest';
import { getPlayerState, handlePlayerStateMessage, subscribeSse } from './playerHub.ts';

/** 모든 필수 필드를 갖춘 스냅샷 프레임 — ended는 tombstone 테스트에서만 붙여요 */
function frame(overrides: Record<string, unknown> = {}) {
	return JSON.stringify({
		guildId: 'g1',
		playing: true,
		paused: false,
		positionMs: 1_000,
		durationMs: 100_000,
		trackTitle: '곡',
		trackAuthor: '아티스트',
		artworkUrl: null,
		isStream: false,
		queue: [],
		queueLength: 0,
		repeatMode: 'off',
		volume: 30,
		requesterName: null,
		sourceName: null,
		updatedAt: 1_000,
		...overrides
	});
}

describe('handlePlayerStateMessage', () => {
	it('라이브 스냅샷을 저장하고 getPlayerState로 내려줘요', () => {
		handlePlayerStateMessage(frame({ guildId: 'live-guild' }), 'sirubot:player:live-guild');
		const state = getPlayerState('live-guild');
		expect(state).not.toBeNull();
		expect(state?.trackTitle).toBe('곡');
		expect(state?.ageMs).toBeGreaterThanOrEqual(0);
		expect(state?.stale).toBe(false);
	});

	it('매칭되는 길드의 SSE 구독자에게만 {player, hub} 엔벨로프를 relay해요', () => {
		const received: string[] = [];
		const other: string[] = [];
		const unsubscribe = subscribeSse('sse-guild', (payload) => received.push(payload));
		const unsubscribeOther = subscribeSse('sse-other', (payload) => other.push(payload));

		handlePlayerStateMessage(frame({ guildId: 'sse-guild' }), 'sirubot:player:sse-guild');

		expect(received).toHaveLength(1);
		const envelope = JSON.parse(received[0]!);
		expect(envelope.player.trackTitle).toBe('곡');
		expect(envelope.hub).toBeDefined();
		expect(other).toHaveLength(0);
		unsubscribe();
		unsubscribeOther();
	});

	it('ended tombstone은 엔트리를 지우고 SSE에 player:null을 relay해요', () => {
		const received: string[] = [];
		const unsubscribe = subscribeSse('end-guild', (payload) => received.push(payload));

		handlePlayerStateMessage(frame({ guildId: 'end-guild' }), 'sirubot:player:end-guild');
		expect(getPlayerState('end-guild')).not.toBeNull();

		handlePlayerStateMessage(frame({ guildId: 'end-guild', ended: true }), 'sirubot:player:end-guild');
		expect(getPlayerState('end-guild')).toBeNull();
		expect(received).toHaveLength(2);
		const tombstone = JSON.parse(received[1]!);
		expect(tombstone.player).toBeNull();
		expect(tombstone.hub).toBeDefined();
		unsubscribe();
	});

	it('payload.guildId가 채널의 길드와 다르면 무시해요', () => {
		handlePlayerStateMessage(frame({ guildId: 'other-guild' }), 'sirubot:player:mismatch-guild');
		expect(getPlayerState('mismatch-guild')).toBeNull();
	});

	it('플레이어 채널이 아니면 무시해요', () => {
		handlePlayerStateMessage(frame({ guildId: 'misc-guild' }), 'sirubot:other:misc-guild');
		expect(getPlayerState('misc-guild')).toBeNull();
	});
});

describe('getPlayerState freshness', () => {
	it('마지막 갱신이 PURGE_MS를 넘으면 유령 엔트리를 정리하고 null을 내려줘요', () => {
		vi.useFakeTimers();
		try {
			handlePlayerStateMessage(frame({ guildId: 'purge-guild' }), 'sirubot:player:purge-guild');
			expect(getPlayerState('purge-guild')).not.toBeNull();

			vi.advanceTimersByTime(10 * 60_000 + 1);
			expect(getPlayerState('purge-guild')).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it('60초가 지나면 stale로 표시하지만 여전히 내려줘요', () => {
		vi.useFakeTimers();
		try {
			handlePlayerStateMessage(frame({ guildId: 'stale-guild' }), 'sirubot:player:stale-guild');
			vi.advanceTimersByTime(61_000);
			const state = getPlayerState('stale-guild');
			expect(state?.stale).toBe(true);
			expect(state?.trackTitle).toBe('곡');
		} finally {
			vi.useRealTimers();
		}
	});
});
