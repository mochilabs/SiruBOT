import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	sendOverride: vi.fn(async () => undefined),
	primeForPlay: vi.fn(async () => undefined)
}));

vi.mock('../lavalink/queue/queueWrapper.ts', () => ({ notifyQueueMutated: vi.fn(), cancelPendingInvalidate: vi.fn() }));
vi.mock('../lavalink/handlers/mixerHandlers.ts', () => ({ sendOverride: mocks.sendOverride }));

import { AudioService } from './audioService.ts';

const makeAudioService = () =>
	new AudioService({
		logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
		guildService: {} as never,
		getAudio: () => ({}) as never,
		getClient: () => ({}) as never,
		getMixerService: () => ({ primeForPlay: mocks.primeForPlay }) as never,
		lavalink: {} as never
	});

const track = (id: string) => ({ encoded: id, info: { identifier: id } });

describe('playPrevious', () => {
	it('previous는 최신 곡이 [0]인 스택이라 가장 최근에 들은 곡부터 되돌린다', async () => {
		// lavalink-client는 곡이 끝날 때 previous.unshift(current)로 쌓아요: C를 듣기 전 A → B 순서로 들었다.
		const player = {
			guildId: 'g',
			transitionState: {},
			queue: { current: track('C'), previous: [track('B'), track('A')], tracks: [track('D')], utils: { save: vi.fn(async () => undefined) } },
			play: vi.fn()
		} as any;
		const service = makeAudioService();

		await expect(service.playPrevious(player)).resolves.toMatchObject({ encoded: 'B' });
		expect(player.queue.current.encoded).toBe('B');
		expect(player.queue.previous.map((t: { encoded: string }) => t.encoded)).toEqual(['A']);
		expect(player.queue.tracks.map((t: { encoded: string }) => t.encoded)).toEqual(['C', 'D']);
		expect(mocks.sendOverride).toHaveBeenLastCalledWith({}, player, 'PLAY_NOW', 'B');

		await service.playPrevious(player);
		expect(player.queue.current.encoded).toBe('A');
		expect(player.queue.previous).toEqual([]);
		expect(player.queue.tracks.map((t: { encoded: string }) => t.encoded)).toEqual(['B', 'C', 'D']);
	});
});
