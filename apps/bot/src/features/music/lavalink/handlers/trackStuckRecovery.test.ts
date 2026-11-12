import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LavalinkManager, type LavalinkTrack, type TrackStuckEvent } from 'lavalink-client';
import { CustomPlayer } from '../player/customPlayer.ts';
import { MixerService } from '../../application/mixerService.ts';
import { clearMixerRuntime } from './mixerHandlers.ts';

/** 믹서·큐 헬퍼가 받는 LavalinkDeps 역할 — 테스트가 mixerService를 채워 넣어요 */
const container: Record<string, any> = {
	logger: { warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
	playerNotifier: { updateController: vi.fn() },
	sponsorBlockService: { prefetch: vi.fn(), queueChanged: vi.fn() }
};

const cjs: typeof import('lavalink-client') = createRequire(import.meta.url)('lavalink-client');
const players: CustomPlayer[] = [];

afterEach(() => {
	for (const player of players.splice(0)) clearMixerRuntime(player);
	vi.restoreAllMocks();
});

describe.each([
	{ format: 'ESM', Manager: LavalinkManager },
	{ format: 'CJS', Manager: cjs.LavalinkManager }
])('trackStuck recovery ($format)', ({ Manager }) => {
	function setup(autoSkip = false) {
		const manager = new Manager<CustomPlayer>({
			nodes: [{ id: 'test', host: 'localhost', port: 2333, authorization: 'test' }],
			sendToShard: () => undefined,
			client: { id: '123456789012345678' },
			playerClass: CustomPlayer,
			autoSkip,
			playerOptions: { onEmptyQueue: { destroyAfterMs: -1 } }
		});
		const player = manager.createPlayer({ guildId: '123456789012345679', voiceChannelId: '123456789012345680', node: 'test' });
		players.push(player);
		const mixer = new MixerService({
			logger: container.logger as never,
			guildService: {} as never,
			callTimeoutMs: 5_000,
			getPlayerNotifier: () => container.playerNotifier,
			lavalink: container as never
		});
		Object.assign(container, { mixerService: mixer });
		vi.spyOn(mixer, 'prepareNextAnalysis').mockResolvedValue(undefined);
		const override = vi.spyOn(mixer, 'override').mockResolvedValue({ duplicate: true });
		const updatePlayer = vi.spyOn(player.node, 'updatePlayer').mockImplementation(async () => {
			throw new Error('Unexpected library stop during mixer recovery');
		});
		const rawTrack = (identifier: string): LavalinkTrack => ({
			encoded: identifier,
			info: {
				identifier,
				title: identifier,
				author: 'test',
				length: 60_000,
				artworkUrl: null,
				uri: `https://www.youtube.com/watch?v=${identifier}`,
				isrc: null,
				isSeekable: true,
				isStream: false,
				sourceName: 'youtube'
			},
			pluginInfo: {},
			userData: {}
		});
		const track = (identifier: string) => manager.utils.buildTrack(rawTrack(identifier), undefined);
		player.queue.current = track('stuck');
		player.playing = true;
		const payload: TrackStuckEvent = {
			op: 'event',
			type: 'TrackStuckEvent',
			guildId: player.guildId,
			thresholdMs: 10_000,
			track: rawTrack('stuck')
		};
		// Exercise the installed library's event continuation, which emitting on the manager alone skips.
		const dispatch = () => Reflect.apply(Reflect.get(player.node, 'trackStuck'), player.node, [player, player.queue.current, payload]);
		return { manager, player, mixer, override, updatePlayer, track, dispatch };
	}

	it.each([1, 2])('advances once without stopping the replacement when %i track(s) remain', async (remaining) => {
		const { manager, player, mixer, override, updatePlayer, track, dispatch } = setup();
		const next = track('next');
		const later = track('later');
		player.queue.tracks.push(...(remaining === 1 ? [next] : [next, later]));
		let recovery: Promise<void> | undefined;
		manager.on('trackStuck', () => {
			recovery = mixer.skip(player);
		});

		await dispatch();
		await recovery;

		expect(updatePlayer).not.toHaveBeenCalled();
		expect(player.queue.current).toBe(next);
		expect(player.queue.tracks).toEqual(remaining === 1 ? [] : [later]);
		expect(player.queue.previous.map((previous) => previous.info.identifier)).toEqual(['stuck']);
		expect(override).toHaveBeenCalledExactlyOnceWith(
			player,
			{ epoch: player.currentEpoch, action: 'PLAY_NOW', encodedTrack: 'next' },
			expect.any(String)
		);
	});

	it('leaves a preloaded transition to the bot without shifting or stopping', async () => {
		const { manager, player, updatePlayer, track, dispatch } = setup();
		const current = player.queue.current;
		const next = track('preloaded');
		player.queue.tracks.push(next);
		const observe = vi.fn();
		manager.on('trackStuck', observe);

		await dispatch();

		expect(observe).toHaveBeenCalledOnce();
		expect(updatePlayer).not.toHaveBeenCalled();
		expect(player.queue.current).toBe(current);
		expect(player.queue.tracks).toEqual([next]);
	});

	it('preserves library queue advancement when autoSkip is enabled', async () => {
		const { player, track, dispatch } = setup(true);
		const next = track('next');
		player.queue.tracks.push(next);
		const play = vi.spyOn(player, 'play').mockResolvedValue(player);

		await dispatch();

		expect(player.queue.current).toBe(next);
		expect(player.queue.tracks).toEqual([]);
		expect(play).toHaveBeenCalledExactlyOnceWith({ track: next, noReplace: false });
	});
});
