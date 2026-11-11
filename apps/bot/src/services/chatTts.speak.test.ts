import { describe, expect, it, vi } from 'vitest';

/**
 * `speakNow` 계약 — `/tts 말하기`가 쓰는 즉석 발화예요.
 * 음악이 있으면 오버레이(announce), 없으면 플레이어 큐 단독 재생으로 갈라지는지 잠가요.
 */

const mocks = vi.hoisted(() => ({
	synthesize: vi.fn(),
	announce: vi.fn(),
	queueAdd: vi.fn(),
	ensurePlayback: vi.fn(),
	search: vi.fn()
}));

const deps = {
	logger: { debug: vi.fn(), info: vi.fn(), error: vi.fn(), warn: vi.fn() },
	tts: { synthesize: mocks.synthesize, isEnabled: () => true },
	pronunciation: { apply: async (_guildId: string, text: string) => text },
	mixer: {
		announce: mocks.announce,
		getState: async () => ({ announcementsQueued: 0 }),
		clearAnnounceQueue: vi.fn()
	} as never,
	playback: { ensurePlayback: mocks.ensurePlayback },
	guildService: {} as never,
	getPlayer: () => undefined
};

import { ChatTtsService } from './chatTts.ts';
vi.mock('./guildSettings/playback.ts', async (orig) => ({
	...(await orig<Record<string, unknown>>()),
	...{ getTtsDuck: async () => 0.35, getTtsAnnounceMode: async () => 'sequential' }
}));

const preset = { enabled: false, voice: null, channel: 'both' as const, emotion: 'neutral' as const };

function playerWith(tracks: unknown[], current: unknown = null) {
	return {
		guildId: 'g1',
		queue: { tracks, current },
		search: mocks.search,
		connected: true,
		voiceChannelId: 'vc'
	};
}

describe('speakNow', () => {
	it('오버레이 예약 실패를 성공으로 알리지 않아요', async () => {
		mocks.synthesize.mockResolvedValue({ url: 'https://tts.example/clip' });
		mocks.announce.mockRejectedValue(new Error('offline'));
		const service = new ChatTtsService(deps);
		await expect(service.speakNow(playerWith([], { info: { identifier: 'music' } }) as never, '안녕', preset)).rejects.toThrow();
	});
	it('음악이 재생 중이면 오버레이로 문장을 읽어요', async () => {
		mocks.synthesize.mockResolvedValue({
			url: 'https://tts.example/clip',
			expiresIn: 600,
			format: 'wav',
			cache: 'miss',
			durationMs: 100,
			warnings: []
		});
		mocks.announce.mockResolvedValue({ guildId: 'g1', id: 1, position: 1, queueLength: 1 });

		const service = new ChatTtsService(deps);
		const player = playerWith([], { info: { identifier: 'music-track' } });

		await expect(service.speakNow(player as never, '안녕하세요', preset)).resolves.toBe('overlay');
		expect(mocks.announce).toHaveBeenCalledWith(player, 'https://tts.example/clip', 0.35, 'sequential', 'both');
	});

	it('음악이 없으면 mixer announce(무음 캐리어)로 읽어요', async () => {
		mocks.synthesize.mockResolvedValue({
			url: 'https://tts.example/clip',
			expiresIn: 600,
			format: 'wav',
			cache: 'miss',
			durationMs: 100,
			warnings: []
		});
		mocks.search.mockResolvedValue({ tracks: [{ info: { title: 'clip' } }] });
		mocks.queueAdd.mockResolvedValue(undefined);

		const service = new ChatTtsService(deps);
		const player = playerWith([]) as unknown as { queue: { tracks: unknown[]; add: unknown }; search: unknown };
		(player.queue as { add: unknown }).add = mocks.queueAdd;

		await expect(service.speakNow(player as never, '안녕하세요', preset)).resolves.toBe('solo');
		expect(mocks.announce).toHaveBeenCalledWith(player, 'https://tts.example/clip', 0.35, 'sequential', 'both');
		expect(mocks.queueAdd).not.toHaveBeenCalled();
	});
});
