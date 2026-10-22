import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { resolveRedisSigningKey, unwrapRedisMessage } from '@sirubot/utils/redisEnvelope';
import { buildPlayerStatePayload, publishPlayerState, publishPlayerEnded, clearPlayerStateTracker } from './playerStatePublisher.ts';

const { store } = vi.hoisted(() => ({ store: { ready: true, publishRawPlayerState: vi.fn() } }));

vi.mock('@sapphire/framework', () => ({
	container: {
		redisStore: store,
		playerStatePublishTracker: undefined,
		client: { guilds: { cache: new Map() } }
	}
}));

const { container } = await import('@sapphire/framework');

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

describe('statusFingerprint-driven publish throttling', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
		store.publishRawPlayerState.mockClear();
		container.playerStatePublishTracker = new Map();
	});

	it('publishes the first snapshot immediately and includes the core state', () => {
		publishPlayerState(player() as never);
		expect(store.publishRawPlayerState).toHaveBeenCalledTimes(1);
		const [channel, payload] = store.publishRawPlayerState.mock.calls[0] as [string, string];
		expect(channel).toBe('g1');
		expect(JSON.parse(payload)).toMatchObject({ guildId: 'g1', playing: false, paused: false, trackTitle: null, queueLength: 0 });
	});

	it('skips an unchanged snapshot inside the 5s window', () => {
		publishPlayerState(player() as never);
		publishPlayerState(player() as never);
		expect(store.publishRawPlayerState).toHaveBeenCalledTimes(1);
	});

	it('republishes an unchanged snapshot after the 5s window', () => {
		publishPlayerState(player() as never);
		vi.setSystemTime(NOW + 5_000);
		publishPlayerState(player() as never);
		expect(store.publishRawPlayerState).toHaveBeenCalledTimes(2);
	});

	it('republishes immediately when the fingerprint changes (track/playing/volume)', () => {
		publishPlayerState(player() as never);
		publishPlayerState(player({ playing: true }) as never);
		publishPlayerState(player({ playing: true, volume: 80 }) as never);
		expect(store.publishRawPlayerState).toHaveBeenCalledTimes(3);
	});

	it('treats a paused toggle as a fingerprint change even while playing stays true', () => {
		publishPlayerState(player({ playing: true }) as never);
		publishPlayerState(player({ playing: true, paused: true }) as never);
		expect(store.publishRawPlayerState).toHaveBeenCalledTimes(2);
	});

	it('ignores position-only drift inside the window (no fingerprint change)', () => {
		publishPlayerState(player({ position: 0 }) as never);
		publishPlayerState(player({ position: 4_000 }) as never);
		expect(store.publishRawPlayerState).toHaveBeenCalledTimes(1);
	});

	it('publishes nothing while redis is not ready', () => {
		store.ready = false;
		publishPlayerState(player() as never);
		expect(store.publishRawPlayerState).not.toHaveBeenCalled();
		store.ready = true;
	});

	it('clearPlayerStateTracker makes the next publish immediate', () => {
		publishPlayerState(player() as never);
		clearPlayerStateTracker('g1');
		publishPlayerState(player() as never);
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
		publishPlayerState(player() as never);
		publishPlayerEnded(player() as never);
		expect(store.publishRawPlayerState).toHaveBeenCalledTimes(2);
		const [channel, payload] = store.publishRawPlayerState.mock.calls[1] as [string, string];
		expect(channel).toBe('g1');
		expect(JSON.parse(payload)).toMatchObject({ guildId: 'g1', ended: true });
	});

	it('clears the tracker so the next live snapshot publishes immediately', () => {
		publishPlayerState(player() as never);
		publishPlayerEnded(player() as never);
		publishPlayerState(player() as never);
		expect(store.publishRawPlayerState).toHaveBeenCalledTimes(3);
	});

	it('publishes nothing while redis is not ready', () => {
		store.ready = false;
		publishPlayerEnded(player() as never);
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

		const payload = buildPlayerStatePayload(p);
		expect(payload.trackTitle).toBe('현재 곡');
		expect(payload.queueLength).toBe(1); // 선예열 추천곡은 대기열 수에서 제외
		expect(payload.queue).toHaveLength(1);
		expect(payload.queue[0]!.title).toBe('대기 곡');
	});
});

describe('now-playing source', () => {
	it('renders the confirmed now-playing track over a displaced queue.current', () => {
		const payload = buildPlayerStatePayload({
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
		} as never);
		expect(payload.trackTitle).toBe('confirmed');
	});
});

describe('SEC-006 서명 봉투', () => {
	const savedEnv = { redis: process.env.REDIS_AUTH_KEY, auth: process.env.AUTH_KEY };

	afterEach(() => {
		if (savedEnv.redis === undefined) delete process.env.REDIS_AUTH_KEY;
		else process.env.REDIS_AUTH_KEY = savedEnv.redis;
		if (savedEnv.auth === undefined) delete process.env.AUTH_KEY;
		else process.env.AUTH_KEY = savedEnv.auth;
		store.publishRawPlayerState.mockClear();
		container.playerStatePublishTracker = new Map();
	});

	it('서명 키가 있으면 검증 가능한 봉투로 감싸 발행해요', () => {
		process.env.REDIS_AUTH_KEY = '';
		process.env.AUTH_KEY = 'test-signing-key';
		publishPlayerState(player() as never);
		const [, payload] = store.publishRawPlayerState.mock.calls[0] as [string, string];
		const body = unwrapRedisMessage(resolveRedisSigningKey(process.env), payload);
		expect(body).not.toBeNull();
		expect(JSON.parse(body as string)).toMatchObject({ guildId: 'g1' });
		// 봉투가 아니면(평문) unwrap 실패해야 해요 — 서명 없는 발행이 섞이지 않는지 확인.
		expect(payload).toContain('"sig"');
	});

	it('키가 없으면 구버전 평문으로 발행해요', () => {
		process.env.REDIS_AUTH_KEY = '';
		process.env.AUTH_KEY = '';
		publishPlayerState(player() as never);
		const [, payload] = store.publishRawPlayerState.mock.calls[0] as [string, string];
		expect(JSON.parse(payload)).toMatchObject({ guildId: 'g1' });
		expect(payload).not.toContain('"sig"');
	});
});
