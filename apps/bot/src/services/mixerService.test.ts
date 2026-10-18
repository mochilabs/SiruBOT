import { afterEach, describe, expect, it, vi } from 'vitest';
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

	it('오버랩이 진행 중이면 상태 조회만 하고 손대지 않는다', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(jsonResponse(mixerState({ crossfadeActive: true, hasNext: true, nextTrackIdentifier: 'abc123' }), 200));
		vi.stubGlobal('fetch', fetchMock);
		const service = new MixerService();

		await service.reconcileAfterResume(queuedPlayer('abc123'));

		expect(service.isPreloaded('123456789012345678')).toBe(false);
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
