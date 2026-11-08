import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ primeForPlay: vi.fn(async () => undefined) }));

vi.mock('@sapphire/framework', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@sapphire/framework')>();
	return {
		...actual,
		container: { ...actual.container, mixerService: { primeForPlay: mocks.primeForPlay }, logger: { warn: vi.fn(), debug: vi.fn() } }
	};
});

import { AudioService } from './audioService.ts';

function makePlayer(serverPlayer: unknown) {
	return {
		guildId: 'g',
		playing: false,
		paused: false,
		node: { fetchPlayer: vi.fn(async () => serverPlayer) },
		play: vi.fn()
	} as any;
}

describe('ensurePlayback', () => {
	it('서버가 이미 재생 중이면 play()로 현재 곡을 되감지 않고 플래그만 보정한다', async () => {
		const player = makePlayer({ track: { encoded: 'x' }, paused: false });
		await new AudioService().ensurePlayback(player);
		expect(player.play).not.toHaveBeenCalled();
		expect(player.playing).toBe(true);
	});

	it('서버에 곡이 없으면 play()를 보낸다', async () => {
		const player = makePlayer({ track: null, paused: false });
		await new AudioService().ensurePlayback(player);
		expect(player.play).toHaveBeenCalledTimes(1);
	});

	it('서버가 일시정지 상태면 resume용 play를 보낸다', async () => {
		const player = makePlayer({ track: { encoded: 'x' }, paused: true });
		player.paused = true;
		await new AudioService().ensurePlayback(player);
		expect(player.play).toHaveBeenCalledWith({ paused: false });
	});
});
