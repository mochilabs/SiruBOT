import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Player } from 'lavalink-client';
import { MixerRequestError, MixerService } from './mixerService.ts';

vi.mock('@sapphire/framework', () => ({ container: { logger: { warn: vi.fn() } } }));

function fakePlayer(): Player {
	return {
		guildId: '123456789012345678',
		node: { options: { host: 'localhost', port: 2333, authorization: 'node-pw' } }
	} as unknown as Player;
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
