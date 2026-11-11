import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ primeForPlay: vi.fn(async () => undefined) }));

import { AudioService } from './audioService.ts';

const makeAudioService = () =>
	new AudioService({
		logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
		guildService: {} as never,
		getAudio: () => ({}) as never,
		getClient: () => ({}) as never,
		getMixerService: () => ({ primeForPlay: mocks.primeForPlay }) as never
	});

function makePlayer(serverPlayer: unknown, queuedEncoded: string | null = 'x') {
	return {
		guildId: 'g',
		playing: false,
		paused: false,
		queue: { current: queuedEncoded === null ? null : { encoded: queuedEncoded } },
		node: { fetchPlayer: vi.fn(async () => serverPlayer) },
		play: vi.fn()
	} as any;
}

describe('ensurePlayback', () => {
	it('서버가 이미 재생 중이면 play()로 현재 곡을 되감지 않고 플래그만 보정한다', async () => {
		const player = makePlayer({ track: { encoded: 'x' }, paused: false });
		await makeAudioService().ensurePlayback(player);
		expect(player.play).not.toHaveBeenCalled();
		expect(player.playing).toBe(true);
	});

	it('서버에 곡이 없으면 play()를 보낸다', async () => {
		const player = makePlayer({ track: null, paused: false });
		await makeAudioService().ensurePlayback(player);
		expect(player.play).toHaveBeenCalledTimes(1);
	});

	it('서버가 일시정지 상태면 resume용 play를 보낸다', async () => {
		const player = makePlayer({ track: { encoded: 'x' }, paused: true });
		player.paused = true;
		await makeAudioService().ensurePlayback(player);
		expect(player.play).toHaveBeenCalledWith({ paused: false });
	});

	it('서버에 이전 곡이 남아 있으면 보정하지 않고 큐의 현재 곡을 play()로 시작한다', async () => {
		const player = makePlayer({ track: { encoded: 'old' }, paused: false }, 'new');
		await makeAudioService().ensurePlayback(player);
		expect(player.play).toHaveBeenCalledTimes(1);
		expect(player.playing).toBe(false);
	});
});

describe('지연 deps', () => {
	it('audio·mixer가 아직 없을 때 만들어도 호출 시점에 읽는다', async () => {
		let audio: { getPlayer: ReturnType<typeof vi.fn>; createPlayer: ReturnType<typeof vi.fn> } | undefined;
		let mixer: { primeForPlay: typeof mocks.primeForPlay } | undefined;
		const service = new AudioService({
			logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
			guildService: {} as never,
			getAudio: () => audio as never,
			getClient: () => ({}) as never,
			getMixerService: () => mixer as never
		});
		const created = { guildId: 'g' };
		audio = { getPlayer: vi.fn(() => undefined), createPlayer: vi.fn(async () => created) };
		mixer = { primeForPlay: mocks.primeForPlay };

		await expect(service.getOrCreatePlayer('g', 'voice', 'text')).resolves.toBe(created);
		expect(audio.createPlayer).toHaveBeenCalledWith(expect.objectContaining({ guildId: 'g', voiceChannelId: 'voice', textChannelId: 'text' }));

		mocks.primeForPlay.mockClear();
		await service.ensurePlayback(makePlayer({ track: null, paused: false }));
		expect(mocks.primeForPlay).toHaveBeenCalledOnce();
	});
});
