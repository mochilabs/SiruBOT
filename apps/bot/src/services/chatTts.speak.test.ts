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

vi.mock('@sapphire/framework', () => ({
	container: {
		ttsService: { synthesize: mocks.synthesize },
		mixerService: {
			announce: mocks.announce,
			getState: async () => ({ announcementsQueued: 0 })
		},
		audioService: { ensurePlayback: mocks.ensurePlayback },
		guildService: { getTtsDuck: async () => 0.35, getTtsAnnounceMode: async () => 'sequential' },
		logger: { debug: vi.fn(), error: vi.fn() }
	}
}));

import { ChatTtsService } from './chatTts.ts';

const preset = { enabled: false, voice: null, speed: null, pitch: null };

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
	it('음악이 재생 중이면 오버레이로 문장을 읽어요', async () => {
		mocks.synthesize.mockResolvedValue({ url: 'https://tts.example/clip', expiresIn: 600, format: 'wav', cache: 'miss' });
		mocks.announce.mockResolvedValue({ guildId: 'g1', id: 1, position: 1, queueLength: 1 });

		const service = new ChatTtsService();
		const player = playerWith([], { info: { identifier: 'music-track' } });

		await expect(service.speakNow(player as never, '안녕하세요', preset)).resolves.toBe('overlay');
		expect(mocks.announce).toHaveBeenCalledWith(player, 'https://tts.example/clip', 0.35, 'sequential');
	});

	it('음악이 없으면 단독 재생으로 큐에 넣어요', async () => {
		mocks.synthesize.mockResolvedValue({ url: 'https://tts.example/clip', expiresIn: 600, format: 'wav', cache: 'miss' });
		mocks.search.mockResolvedValue({ tracks: [{ info: { title: 'clip' } }] });
		mocks.queueAdd.mockResolvedValue(undefined);

		const service = new ChatTtsService();
		const player = playerWith([]) as unknown as { queue: { tracks: unknown[]; add: unknown }; search: unknown };
		(player.queue as { add: unknown }).add = mocks.queueAdd;

		await expect(service.speakNow(player as never, '안녕하세요', preset)).resolves.toBe('solo');
		expect(mocks.announce).not.toHaveBeenCalled();
		expect(mocks.queueAdd).toHaveBeenCalled();
	});
});
