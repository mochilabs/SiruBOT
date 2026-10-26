import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Player } from 'lavalink-client';
import type { CustomPlayer } from '../modules/audio/lavalink/player/customPlayer.ts';
import { MixerService } from './mixerService.ts';

vi.mock('@sapphire/framework', () => ({
	container: {
		logger: { warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
		guildService: {
			getMixerSettings: vi
				.fn()
				.mockResolvedValue({ gaplessEnabled: true, crossfadeEnabled: true, crossfadeMs: 3000, normalizationEnabled: false })
		},
		playerNotifier: { updateController: vi.fn() }
	}
}));

function fakePlayer(): Player {
	return {
		guildId: '123456789012345678',
		node: { options: { host: 'localhost', port: 2333, authorization: 'node-pw' } }
	} as unknown as Player;
}

describe('MixerService v2 Protocol Tests', () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchMock = vi.fn();
		globalThis.fetch = fetchMock as unknown as typeof fetch;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('returns the 202 enqueue receipt for announce', async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ guildId: '123', id: 42, position: 1, queueLength: 1 }), {
				status: 202,
				headers: { 'Content-Type': 'application/json' }
			})
		);

		const service = new MixerService();
		const result = await service.announce(fakePlayer(), 'https://tts.example/clip.mp3', 0.2);
		expect(result).toEqual({ guildId: '123', id: 42, position: 1, queueLength: 1 });
	});

	it('throws MixerRequestError on non-2xx', async () => {
		fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'bad input' }), { status: 400 }));

		const service = new MixerService();
		await expect(service.announce(fakePlayer(), 'clip', 0.2)).rejects.toMatchObject({
			name: 'MixerRequestError',
			status: 400
		});
	});

	it('arm sends Idempotency-Key header and correct body', async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ state: 'ARMED', epoch: 42 }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);

		const service = new MixerService();
		const player = fakePlayer() as CustomPlayer;
		await service.arm(player, { epoch: 42, encodedTrack: 'enc-abc' }, 'test-key-123');

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('http://localhost:2333/mixer/queue/arm');
		expect(init.method).toBe('POST');
		expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('test-key-123');
		expect(JSON.parse(init.body as string)).toEqual({
			guildId: '123456789012345678',
			epoch: 42,
			encodedTrack: 'enc-abc',
			isEmpty: false
		});
	});

	it('override sends action and Idempotency-Key header', async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ state: 'PLAYING', epoch: 43 }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);

		const service = new MixerService();
		const player = fakePlayer() as CustomPlayer;
		await service.override(player, { epoch: 43, action: 'PLAY_NOW', encodedTrack: 'enc-xyz' }, 'test-key-456');

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('http://localhost:2333/mixer/queue/override');
		expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('test-key-456');
		expect(JSON.parse(init.body as string)).toEqual({
			guildId: '123456789012345678',
			epoch: 43,
			action: 'PLAY_NOW',
			encodedTrack: 'enc-xyz'
		});
	});

	it('reset forces lastKnownEpoch update', async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ lastKnownEpoch: 100, protocolVersion: 2 }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);

		const service = new MixerService();
		const player = fakePlayer() as CustomPlayer;
		await service.reset(player, 100, 'test-reset-key');

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('http://localhost:2333/mixer/reset');
		expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('test-reset-key');
		expect(JSON.parse(init.body as string)).toEqual({
			guildId: '123456789012345678',
			epoch: 100
		});
	});
});
