import { describe, expect, it, vi } from 'vitest';

type Store = typeof import('./playbackStore.ts');

/** 모듈 전역 상태(이벤트 버퍼·카운트)를 테스트마다 깨끗이 시작하기 위해 매번 새로 import해요. */
async function loadStore(): Promise<Store> {
	vi.resetModules();
	return import('./playbackStore.ts');
}

function trackError(at: number, guildId = 'guild-1') {
	return {
		type: 'track_error' as const,
		guildId,
		nodeId: null,
		shardId: 0,
		trackTitle: '곡',
		trackAuthor: '가수',
		trackId: 'track-id',
		reason: null,
		consecutiveErrors: 1,
		at
	};
}

function nodeEvent(type: 'node_disconnect' | 'node_error', nodeId: string, at: number, reason: string | null = null) {
	return {
		type,
		guildId: null,
		nodeId,
		shardId: null,
		trackTitle: null,
		trackAuthor: null,
		trackId: null,
		reason,
		consecutiveErrors: 0,
		at
	};
}

describe('playbackStore', () => {
	it('puts track errors into recentErrors', async () => {
		const store = await loadStore();
		store.recordPlaybackEvent(trackError(1_000));
		expect(store.playbackSnapshot().recentErrors).toHaveLength(1);
	});

	it('includes node events in recentErrors without a guild id', async () => {
		const store = await loadStore();
		store.recordPlaybackEvent(nodeEvent('node_error', 'main', 1_000, 'boom'));
		const snapshot = store.playbackSnapshot();
		expect(snapshot.recentErrors).toHaveLength(1);
		expect(snapshot.recentErrors[0]).toMatchObject({ type: 'node_error', nodeId: 'main', guildId: null, reason: 'boom', count: 1 });
		expect(snapshot.guilds).toBe(0);
	});

	it('merges duplicate node reports from bot workers into a single entry', async () => {
		const store = await loadStore();
		for (let i = 0; i < 5; i++) store.recordPlaybackEvent(nodeEvent('node_disconnect', 'main', 1_000 + i, 'closed'));
		const snapshot = store.playbackSnapshot();
		expect(snapshot.recentErrors).toHaveLength(1);
		expect(snapshot.recentErrors[0].count).toBe(5);
		// 카운트는 원 보고 수를 유지해요 (병합은 목록 표시만)
		expect(snapshot.counts.node_disconnect).toBe(5);
		expect(snapshot.total).toBe(1);
	});

	it('does not merge different nodes, different types, or reports outside the merge window', async () => {
		const store = await loadStore();
		store.recordPlaybackEvent(nodeEvent('node_disconnect', 'main', 1_000));
		store.recordPlaybackEvent(nodeEvent('node_disconnect', 'backup', 1_001));
		store.recordPlaybackEvent(nodeEvent('node_error', 'main', 1_002));
		store.recordPlaybackEvent(nodeEvent('node_disconnect', 'main', 1_000 + 120_000));
		expect(store.playbackSnapshot().recentErrors).toHaveLength(4);
	});

	it('updates the merged entry reason when a later report carries one', async () => {
		const store = await loadStore();
		store.recordPlaybackEvent(nodeEvent('node_disconnect', 'main', 1_000, null));
		store.recordPlaybackEvent(nodeEvent('node_disconnect', 'main', 1_500, 'code 1006'));
		expect(store.playbackSnapshot().recentErrors[0]).toMatchObject({ reason: 'code 1006', count: 2 });
	});

	it('tracks guilds only from guild events', async () => {
		const store = await loadStore();
		store.recordPlaybackEvent(trackError(1_000, 'guild-1'));
		store.recordPlaybackEvent(trackError(2_000, 'guild-2'));
		store.recordPlaybackEvent(nodeEvent('node_error', 'main', 3_000));
		expect(store.playbackSnapshot().guilds).toBe(2);
	});
});
