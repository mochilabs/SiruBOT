import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { unwrapRedisMessage } from '@sirubot/utils/redisEnvelope';
import { setConfigForTesting } from '../../../lib/config.ts';
import { makeTestConfig } from '../../../lib/config.testing.ts';
import { buildPlayerStatePayload, publishPlayerState, publishPlayerEnded, clearPlayerStateTracker } from './playerStatePublisher.ts';

const { store } = vi.hoisted(() => ({ store: { ready: true, publishRawPlayerState: vi.fn() } }));

const container: Record<string, any> = {
	redisStore: store,
	playerStatePublishTracker: new Map(),
	client: { guilds: { cache: new Map() } }
};

const NOW = new Date('2026-10-14T12:00:00Z').getTime();

function player(overrides: Record<string, unknown> = {}) {
	return {
		guildId: 'g1',
		playing: false,
		paused: false,
		position: 0,
		volume: 30,
		repeatMode: 'off',
		queue: { current: null, tracks: [] },
		...overrides
	};
}

beforeEach(() => setConfigForTesting(makeTestConfig()));
afterEach(() => setConfigForTesting(null));

describe('statusFingerprint-driven publish throttling', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
		store.publishRawPlayerState.mockClear();
		container.playerStatePublishTracker = new Map();
	});

	it('publishes the first snapshot immediately and includes the core state', () => {
		publishPlayerState(container as never, player() as never);
		expect(store.publishRawPlayerState).toHaveBeenCalledTimes(1);
		const [channel, payload] = store.publishRawPlayerState.mock.calls[0] as [string, string];
		expect(channel).toBe('g1');
		expect(JSON.parse(payload)).toMatchObject({ guildId: 'g1', playing: false, paused: false, trackTitle: null, queueLength: 0 });
	});

	it('skips an unchanged snapshot inside the 5s window', () => {
		publishPlayerState(container as never, player() as never);
		publishPlayerState(container as never, player() as never);
		expect(store.publishRawPlayerState).toHaveBeenCalledTimes(1);
	});

	it('republishes an unchanged snapshot after the 5s window', () => {
		publishPlayerState(container as never, player() as never);
		vi.setSystemTime(NOW + 5_000);
		publishPlayerState(container as never, player() as never);
		expect(store.publishRawPlayerState).toHaveBeenCalledTimes(2);
	});

	it('republishes immediately when the fingerprint changes (track/playing/volume)', () => {
		publishPlayerState(container as never, player() as never);
		publishPlayerState(container as never, player({ playing: true }) as never);
		publishPlayerState(container as never, player({ playing: true, volume: 80 }) as never);
		expect(store.publishRawPlayerState).toHaveBeenCalledTimes(3);
	});

	it('treats a paused toggle as a fingerprint change even while playing stays true', () => {
		publishPlayerState(container as never, player({ playing: true }) as never);
		publishPlayerState(container as never, player({ playing: true, paused: true }) as never);
		expect(store.publishRawPlayerState).toHaveBeenCalledTimes(2);
	});

	it('ignores small position drift (under 1.5s) inside the window', () => {
		publishPlayerState(container as never, player({ position: 0 }) as never);
		publishPlayerState(container as never, player({ position: 1_000 }) as never);
		expect(store.publishRawPlayerState).toHaveBeenCalledTimes(1);
	});

	it('publishes immediately on a seek (position jumps 1.5s+ from the expected one)', () => {
		publishPlayerState(container as never, player({ playing: true, position: 10_000 }) as never);
		vi.setSystemTime(NOW + 1_000);
		publishPlayerState(container as never, player({ playing: true, position: 60_000 }) as never);
		expect(store.publishRawPlayerState).toHaveBeenCalledTimes(2);
		expect(JSON.parse(store.publishRawPlayerState.mock.calls[1]![1] as string).positionMs).toBe(60_000);
	});

	it('publishes immediately on a backward seek too', () => {
		publishPlayerState(container as never, player({ playing: true, position: 60_000 }) as never);
		vi.setSystemTime(NOW + 1_000);
		publishPlayerState(container as never, player({ playing: true, position: 5_000 }) as never);
		expect(store.publishRawPlayerState).toHaveBeenCalledTimes(2);
	});

	it('does not treat normal playback progress as a jump', () => {
		publishPlayerState(container as never, player({ playing: true, position: 10_000 }) as never);
		vi.setSystemTime(NOW + 3_000);
		publishPlayerState(container as never, player({ playing: true, position: 13_000 }) as never);
		vi.setSystemTime(NOW + 4_000);
		publishPlayerState(container as never, player({ playing: true, position: 14_800 }) as never);
		expect(store.publishRawPlayerState).toHaveBeenCalledTimes(1);
	});

	it('expects no progress while paused', () => {
		publishPlayerState(container as never, player({ playing: true, paused: true, position: 10_000 }) as never);
		vi.setSystemTime(NOW + 3_000);
		publishPlayerState(container as never, player({ playing: true, paused: true, position: 10_000 }) as never);
		expect(store.publishRawPlayerState).toHaveBeenCalledTimes(1);
		vi.setSystemTime(NOW + 4_000);
		publishPlayerState(container as never, player({ playing: true, paused: true, position: 20_000 }) as never);
		expect(store.publishRawPlayerState).toHaveBeenCalledTimes(2);
	});

	it('immediate option (track start) bypasses the 5s window for an unchanged snapshot', () => {
		publishPlayerState(container as never, player() as never);
		publishPlayerState(container as never, player() as never, { immediate: true });
		expect(store.publishRawPlayerState).toHaveBeenCalledTimes(2);
	});

	it('a different track uri with the same title is a fingerprint change', () => {
		const track = (uri: string) => ({ info: { title: '같은 제목', author: 'a', duration: 1, uri } });
		publishPlayerState(container as never, player({ playing: true, queue: { current: track('u1'), tracks: [] } }) as never);
		publishPlayerState(container as never, player({ playing: true, queue: { current: track('u2'), tracks: [] } }) as never);
		expect(store.publishRawPlayerState).toHaveBeenCalledTimes(2);
	});

	it('publishes nothing while redis is not ready', () => {
		store.ready = false;
		publishPlayerState(container as never, player() as never);
		expect(store.publishRawPlayerState).not.toHaveBeenCalled();
		store.ready = true;
	});

	it('clearPlayerStateTracker makes the next publish immediate', () => {
		publishPlayerState(container as never, player() as never);
		clearPlayerStateTracker(container as never, 'g1');
		publishPlayerState(container as never, player() as never);
		expect(store.publishRawPlayerState).toHaveBeenCalledTimes(2);
	});
});

describe('publishPlayerEnded — 확정 종료 tombstone', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
		store.publishRawPlayerState.mockClear();
		container.playerStatePublishTracker = new Map();
	});

	it('bypasses the 5s throttle and publishes ended:true immediately', () => {
		publishPlayerState(container as never, player() as never);
		publishPlayerEnded(container as never, player() as never);
		expect(store.publishRawPlayerState).toHaveBeenCalledTimes(2);
		const [channel, payload] = store.publishRawPlayerState.mock.calls[1] as [string, string];
		expect(channel).toBe('g1');
		expect(JSON.parse(payload)).toMatchObject({ guildId: 'g1', ended: true });
	});

	it('clears the tracker so the next live snapshot publishes immediately', () => {
		publishPlayerState(container as never, player() as never);
		publishPlayerEnded(container as never, player() as never);
		publishPlayerState(container as never, player() as never);
		expect(store.publishRawPlayerState).toHaveBeenCalledTimes(3);
	});

	it('publishes nothing while redis is not ready', () => {
		store.ready = false;
		publishPlayerEnded(container as never, player() as never);
		expect(store.publishRawPlayerState).not.toHaveBeenCalled();
		store.ready = true;
	});
});

describe('buildPlayerStatePayload', () => {
	it('summarizes the current track and counts only user-queued tracks', () => {
		const current = {
			info: { title: '현재 곡', author: '아티스트', duration: 100_000, artworkUrl: null, isStream: false },
			requester: { id: 'u1' }
		};
		const userTrack = {
			info: { title: '대기 곡', author: '다른 아티스트', duration: 50_000, artworkUrl: null, isStream: false },
			requester: { id: 'u1' }
		};
		const relatedTrack = {
			info: { title: '추천 곡', author: '추천 아티스트', duration: 10_000, artworkUrl: null, isStream: false },
			requester: { id: 'related_track' }
		};
		const p = player({ queue: { current, tracks: [userTrack, relatedTrack] } }) as never;

		const payload = buildPlayerStatePayload(container as never, p);
		expect(payload.trackTitle).toBe('현재 곡');
		expect(payload.queueLength).toBe(1);
		expect(payload.queue).toHaveLength(1);
		expect(payload.queue[0]!.title).toBe('대기 곡');
	});
});

describe('now-playing source', () => {
	it('renders the confirmed now-playing track over a displaced queue.current', () => {
		const payload = buildPlayerStatePayload(
			container as never,
			{
				...player(),
				queue: {
					current: { encoded: 'enc-x', info: { title: 'displaced', identifier: 'id-x', duration: 1 } },
					tracks: []
				},
				transitionState: {
					stopByCommand: false,
					lastStartedEncoded: null,
					preloadConsumedAt: null,
					confirmedNowPlaying: { encoded: 'enc-a', info: { title: 'confirmed', identifier: 'id-a', duration: 1000 } },
					serverConsumedTrack: null
				}
			} as never
		);
		expect(payload.trackTitle).toBe('confirmed');
	});
});

describe('서명된 메시지', () => {
	afterEach(() => {
		setConfigForTesting(null);
		store.publishRawPlayerState.mockClear();
		container.playerStatePublishTracker = new Map();
	});

	it('서명 키가 있으면 검증 가능한 봉투로 감싸 발행해요', () => {
		setConfigForTesting(makeTestConfig({ REDIS_AUTH_KEY: '', AUTH_KEY: 'test-signing-key' }));
		publishPlayerState(container as never, player() as never);
		const [, payload] = store.publishRawPlayerState.mock.calls[0] as [string, string];
		const body = unwrapRedisMessage('test-signing-key', payload);
		expect(body).not.toBeNull();
		expect(JSON.parse(body as string)).toMatchObject({ guildId: 'g1' });
		expect(payload).toContain('"sig"');
	});

	it('키가 없으면 구버전 평문으로 발행해요', () => {
		setConfigForTesting(makeTestConfig({ REDIS_AUTH_KEY: '', AUTH_KEY: '' }));
		publishPlayerState(container as never, player() as never);
		const [, payload] = store.publishRawPlayerState.mock.calls[0] as [string, string];
		expect(JSON.parse(payload)).toMatchObject({ guildId: 'g1' });
		expect(payload).not.toContain('"sig"');
	});
});
