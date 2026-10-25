import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Player } from 'lavalink-client';
import { MixerRequestError, MixerService } from './mixerService.ts';

vi.mock('@sapphire/framework', () => ({
	container: {
		logger: { warn: vi.fn() },
		guildService: { getMixerSettings: vi.fn().mockResolvedValue({ gaplessEnabled: true, crossfadeEnabled: true, crossfadeMs: 3000 }) }
	}
}));

function fakePlayer(): Player {
	return {
		guildId: '123456789012345678',
		node: { options: { host: 'localhost', port: 2333, authorization: 'node-pw' } }
	} as unknown as Player;
}

/** reconcile 테스트용 — 대기열 머리 트랙을 identifier와 함께 넣는다. */
function queuedPlayer(headIdentifier?: string): Player {
	return {
		...fakePlayer(),
		repeatMode: 'off',
		queue: {
			tracks: headIdentifier
				? [{ info: { identifier: headIdentifier, uri: `https://example.com/${headIdentifier}`, sourceName: 'youtube' } }]
				: []
		}
	} as unknown as Player;
}

function mixerState(overrides: Record<string, unknown> = {}) {
	return {
		guildId: '123456789012345678',
		hasNext: false,
		overlayActive: false,
		crossfadeActive: false,
		crossfadeEnabled: true,
		crossfadeMs: 3000,
		fadeInMs: 0,
		duckLevel: 0.2,
		silenceEnabled: true,
		silenceThresholdDb: -40,
		tailConfirmMs: 500,
		nextTrimMs: null,
		announcementsQueued: 0,
		...overrides
	};
}

function jsonResponse(body: unknown, status = 202) {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => vi.unstubAllGlobals());

describe('MixerService.announce (queued contract)', () => {
	it('returns the 202 enqueue receipt as-is', async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ guildId: '123456789012345678', id: 7, position: 2, queueLength: 2 }, 202));
		vi.stubGlobal('fetch', fetchMock);

		const receipt = await new MixerService().announce(fakePlayer(), 'http://tts.internal/audio.wav', 0.2);

		expect(receipt).toEqual({ guildId: '123456789012345678', id: 7, position: 2, queueLength: 2 });
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('http://localhost:2333/mixer/announce');
		expect(init.method).toBe('POST');
		expect((init.headers as Record<string, string>).Authorization).toBe('node-pw');
		expect(JSON.parse(String(init.body))).toEqual({ guildId: '123456789012345678', identifier: 'http://tts.internal/audio.wav', duckLevel: 0.2 });
	});

	it('treats a full announce queue as success, not busy', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ guildId: '123456789012345678', id: 9, position: 5, queueLength: 5 }, 202)));

		const receipt = await new MixerService().announce(fakePlayer(), 'http://tts.internal/audio.wav', 0.2);

		expect(receipt.position).toBe(5);
		expect(receipt.queueLength).toBe(5);
	});

	it('throws MixerRequestError carrying the upstream status on non-2xx', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ message: 'boom' }, 503)));

		await expect(new MixerService().announce(fakePlayer(), 'http://tts.internal/audio.wav', 0.2)).rejects.toMatchObject({
			name: 'MixerRequestError',
			status: 503
		});
	});

	it('normalizes network failure to MixerRequestError(504)', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

		await expect(new MixerService().announce(fakePlayer(), 'http://tts.internal/audio.wav', 0.2)).rejects.toMatchObject({
			name: 'MixerRequestError',
			status: 504
		});
		expect(MixerRequestError).toBeDefined();
	});
});

describe('MixerService overlap abort (mixer WS op 기록)', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-10-18T12:00:00Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('aborted overlapEnd만 consumeOverlapAbort로 기록한다 — overlapStart는 오버랩 기록, handoff/비문자열 guildId는 무시', () => {
		const service = new MixerService();
		service.observeMixerEvent({ op: 'mixer', type: 'overlapStart', guildId: '123' });
		expect(service.consumeOverlapAbort('123')).toBe(false);
		// overlapStart는 activeOverlaps를 켠다.
		expect(service.isOverlapActive('123')).toBe(true);
		expect(service.getOverlapTrackIdentifier('123')).toBeNull();
		service.observeMixerEvent({ op: 'mixer', type: 'overlapEnd', reason: 'handoff', guildId: '123' });
		expect(service.consumeOverlapAbort('123')).toBe(false);
		service.observeMixerEvent({ op: 'mixer', type: 'overlapEnd', reason: 'aborted', guildId: 123 });
		expect(service.consumeOverlapAbort('123')).toBe(false);
		service.observeMixerEvent(null);
		service.observeMixerEvent(undefined);
		expect(service.consumeOverlapAbort('123')).toBe(false);

		service.observeMixerEvent({ op: 'mixer', type: 'overlapEnd', reason: 'aborted', guildId: '123' });
		expect(service.consumeOverlapAbort('123')).toBe(true);
	});

	it('abort 기록은 1회성이다 — 두 번째 consume은 false', () => {
		const service = new MixerService();
		service.observeMixerEvent({ op: 'mixer', type: 'overlapEnd', reason: 'aborted', guildId: '123' });
		expect(service.consumeOverlapAbort('123')).toBe(true);
		expect(service.consumeOverlapAbort('123')).toBe(false);
	});

	it('grace(5s)가 지난 기록은 만료된 것으로 본다', () => {
		const service = new MixerService();
		service.observeMixerEvent({ op: 'mixer', type: 'overlapEnd', reason: 'aborted', guildId: '123' });
		vi.setSystemTime(new Date('2026-10-18T12:00:06Z'));
		expect(service.consumeOverlapAbort('123')).toBe(false);
	});

	it('guild별로 기록이 독립이다', () => {
		const service = new MixerService();
		service.observeMixerEvent({ op: 'mixer', type: 'overlapEnd', reason: 'aborted', guildId: 'one' });
		expect(service.consumeOverlapAbort('two')).toBe(false);
		expect(service.consumeOverlapAbort('one')).toBe(true);
	});
});

describe('MixerService activeOverlaps (overlapStart → overlapEnd 수명)', () => {
	it('overlapStart로 켜지고 overlapEnd로 꺼진다', () => {
		const service = new MixerService();
		expect(service.isOverlapActive('123')).toBe(false);
		expect(service.getOverlapTrackIdentifier('123')).toBeNull();

		service.observeMixerEvent({ op: 'mixer', type: 'overlapStart', guildId: '123', track: { identifier: 'abc123' } });
		expect(service.isOverlapActive('123')).toBe(true);
		expect(service.getOverlapTrackIdentifier('123')).toBe('abc123');

		service.observeMixerEvent({ op: 'mixer', type: 'overlapEnd', reason: 'handoff', guildId: '123' });
		expect(service.isOverlapActive('123')).toBe(false);
		expect(service.getOverlapTrackIdentifier('123')).toBeNull();
	});

	it('track 정보가 없는 overlapStart는 null 식별자로 기록된다', () => {
		const service = new MixerService();
		service.observeMixerEvent({ op: 'mixer', type: 'overlapStart', guildId: '123' });
		expect(service.isOverlapActive('123')).toBe(true);
		expect(service.getOverlapTrackIdentifier('123')).toBeNull();

		service.observeMixerEvent({ op: 'mixer', type: 'overlapStart', guildId: '456', track: { identifier: 42 } });
		expect(service.isOverlapActive('456')).toBe(true);
		expect(service.getOverlapTrackIdentifier('456')).toBeNull();
	});

	it('aborted overlapEnd도 오버랩을 끝낸 뒤 abort 기록을 남긴다', () => {
		const service = new MixerService();
		service.observeMixerEvent({ op: 'mixer', type: 'overlapStart', guildId: '123', track: { identifier: 'abc123' } });
		service.observeMixerEvent({ op: 'mixer', type: 'overlapEnd', reason: 'aborted', guildId: '123' });
		expect(service.isOverlapActive('123')).toBe(false);
		expect(service.getOverlapTrackIdentifier('123')).toBeNull();
		expect(service.consumeOverlapAbort('123')).toBe(true);
	});

	it('guild별로 오버랩 기록이 독립이다', () => {
		const service = new MixerService();
		service.observeMixerEvent({ op: 'mixer', type: 'overlapStart', guildId: 'one', track: { identifier: 'a' } });
		service.observeMixerEvent({ op: 'mixer', type: 'overlapStart', guildId: 'two' });
		expect(service.getOverlapTrackIdentifier('one')).toBe('a');
		expect(service.getOverlapTrackIdentifier('two')).toBeNull();
		expect(service.getOverlapTrackIdentifier('three')).toBeNull();

		service.observeMixerEvent({ op: 'mixer', type: 'overlapEnd', reason: 'handoff', guildId: 'one' });
		expect(service.isOverlapActive('one')).toBe(false);
		expect(service.isOverlapActive('two')).toBe(true);
	});

	it('skip은 진행 중 오버랩 기록을 함께 지운다', async () => {
		const service = new MixerService();
		const player = {
			guildId: '123456789012345678',
			node: { options: { host: 'localhost', port: 2333, authorization: 'node-pw' } }
		} as unknown as Player;
		const clearNextSpy = vi.spyOn(service, 'clearNext').mockResolvedValue(undefined);
		const skipSpy = vi.fn().mockResolvedValue(undefined);
		(player as unknown as { skip: typeof skipSpy }).skip = skipSpy;

		service.observeMixerEvent({ op: 'mixer', type: 'overlapStart', guildId: '123456789012345678', track: { identifier: 'abc123' } });
		expect(service.isOverlapActive('123456789012345678')).toBe(true);

		await service.skip(player);

		expect(clearNextSpy).toHaveBeenCalledWith(player);
		expect(skipSpy).toHaveBeenCalledWith(undefined);
		expect(service.isOverlapActive('123456789012345678')).toBe(false);
	});

	it('markUnmanaged와 takePreloadedIdentifier도 오버랩 기록을 지운다', async () => {
		const service = new MixerService();
		service.observeMixerEvent({ op: 'mixer', type: 'overlapStart', guildId: 'one', track: { identifier: 'a' } });
		service.observeMixerEvent({ op: 'mixer', type: 'overlapStart', guildId: 'two', track: { identifier: 'b' } });

		service.markUnmanaged('one');
		expect(service.isOverlapActive('one')).toBe(false);

		service.takePreloadedIdentifier('two');
		expect(service.isOverlapActive('two')).toBe(false);
	});

	it('resume 복구 때 서버가 crossfadeActive면 incoming 트랙 식별자로 오버랩을 채택한다', async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse(mixerState({ crossfadeActive: true, subTrackIdentifier: 'incoming-abc' }), 200));
		vi.stubGlobal('fetch', fetchMock);
		const service = new MixerService();

		await service.reconcileAfterResume(queuedPlayer('abc123'));

		expect(service.isOverlapActive('123456789012345678')).toBe(true);
		expect(service.getOverlapTrackIdentifier('123456789012345678')).toBe('incoming-abc');
	});
});

describe('MixerService.reconcileAfterResume (재시작 뒤 서버 상태 반영)', () => {
	it('서버 슬롯이 대기열 머리와 같으면 그대로 채택한다', async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse(mixerState({ hasNext: true, nextTrackIdentifier: 'abc123' }), 200));
		vi.stubGlobal('fetch', fetchMock);
		const service = new MixerService();

		await service.reconcileAfterResume(queuedPlayer('abc123'));

		expect(service.isPreloaded('123456789012345678')).toBe(true);
		expect(service.takePreloadedIdentifier('123456789012345678')).toBe('abc123');
		// 채택 경로는 상태 조회만 한다 — 슬롯을 다시 쓰지 않는다.
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect((fetchMock.mock.calls[0] as [string])[0]).toBe('http://localhost:2333/mixer/state?guildId=123456789012345678');
	});

	it('서버 슬롯이 다른 곡이면 비우고 대기열 머리로 다시 예열한다', async () => {
		const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
			if (init?.method === 'DELETE') return Promise.resolve(jsonResponse({ ok: true }, 204));
			if (init?.method === 'POST') return Promise.resolve(jsonResponse(mixerState({ hasNext: true }), 200));
			return Promise.resolve(jsonResponse(mixerState({ hasNext: true, nextTrackIdentifier: 'stale-id' }), 200));
		});
		vi.stubGlobal('fetch', fetchMock);
		const service = new MixerService();

		await service.reconcileAfterResume(queuedPlayer('fresh-id'));

		expect(service.isPreloaded('123456789012345678')).toBe(true);
		expect(service.takePreloadedIdentifier('123456789012345678')).toBe('fresh-id');
		const calls = fetchMock.mock.calls as Array<[string, RequestInit?]>;
		expect(calls.map(([url, init]) => `${init?.method ?? 'GET'} ${url}`)).toEqual([
			'GET http://localhost:2333/mixer/state?guildId=123456789012345678',
			'DELETE http://localhost:2333/mixer/queue/next?guildId=123456789012345678',
			'POST http://localhost:2333/mixer/queue/next'
		]);
		expect(JSON.parse(String(calls[2]![1]!.body))).toEqual({ guildId: '123456789012345678', identifier: 'fresh-id' });
	});

	it('대기열이 비었는데 슬롯이 남아 있으면 슬롯만 비운다', async () => {
		const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
			if (init?.method === 'DELETE') return Promise.resolve(jsonResponse({ ok: true }, 204));
			return Promise.resolve(jsonResponse(mixerState({ hasNext: true, nextTrackIdentifier: 'stale-id' }), 200));
		});
		vi.stubGlobal('fetch', fetchMock);
		const service = new MixerService();

		await service.reconcileAfterResume(queuedPlayer());

		expect(service.isPreloaded('123456789012345678')).toBe(false);
		const calls = fetchMock.mock.calls as Array<[string, RequestInit?]>;
		expect(calls.map(([url, init]) => `${init?.method ?? 'GET'} ${url}`)).toEqual([
			'GET http://localhost:2333/mixer/state?guildId=123456789012345678',
			'DELETE http://localhost:2333/mixer/queue/next?guildId=123456789012345678'
		]);
	});

	it('404면 클라이언트 소유 진행으로 두고 추가 조작을 하지 않는다', async () => {
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: 'No mixer state' }, 404));
		vi.stubGlobal('fetch', fetchMock);
		const service = new MixerService();

		await service.reconcileAfterResume(queuedPlayer('abc123'));

		expect(service.isPreloaded('123456789012345678')).toBe(false);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('오버랩이 진행 중이면 슬롯과 incoming을 각각 상태로만 보존한다', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(jsonResponse(mixerState({ crossfadeActive: true, hasNext: true, nextTrackIdentifier: 'abc123' }), 200));
		vi.stubGlobal('fetch', fetchMock);
		const service = new MixerService();

		await service.reconcileAfterResume(queuedPlayer('abc123'));

		expect(service.isOverlapActive('123456789012345678')).toBe(true);
		expect(service.isPreloaded('123456789012345678')).toBe(true);
		expect(service.takePreloadedIdentifier('123456789012345678')).toBe('abc123');
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('상태 조회 실패(네트워크)는 기록을 바꾸지 않고 넘어간다', async () => {
		const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
		vi.stubGlobal('fetch', fetchMock);
		const service = new MixerService();

		await expect(service.reconcileAfterResume(queuedPlayer('abc123'))).resolves.toBeUndefined();

		expect(service.isPreloaded('123456789012345678')).toBe(false);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
