import { describe, expect, it, vi, beforeEach } from 'vitest';

const { getSubLogger } = vi.hoisted(() => ({ getSubLogger: vi.fn() }));
const stubLogger = { trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

vi.mock('@sapphire/framework', () => ({ container: { logger: { getSubLogger } } }));
vi.mock('../playerStatePublisher.ts', () => ({ publishPlayerState: vi.fn() }));

import { PlayerHandler } from './playerHandler.ts';
import { SponsorBlockHandler } from './sponsorBlockHandler.ts';
import { CustomPlayer } from '../player/customPlayer.ts';
import { container } from '@sapphire/framework';

describe('SponsorBlock crossfade overlap suppression', () => {
	let player: CustomPlayer;
	let lavalinkManager: any;

	beforeEach(() => {
		getSubLogger.mockReturnValue(stubLogger);

		lavalinkManager = {
			on: vi.fn(),
			removeAllListeners: vi.fn()
		};

		player = {
			guildId: 'guild-1',
			position: 50_000,
			sponsorBlockSegments: [],
			sponsorBlockCrossfadeSuppressed: false,
			deleteSponsorBlock: vi.fn().mockResolvedValue(undefined),
			setSponsorBlock: vi.fn().mockResolvedValue(undefined),
			queue: {
				current: {
					info: {
						duration: 60_000
					}
				}
			}
		} as unknown as CustomPlayer;

		Object.assign(container, {
			logger: { getSubLogger },
			redisStore: {
				getPlayerSaver: () => ({ set: vi.fn().mockResolvedValue(undefined) })
			},
			playerNotifier: {
				onPlayerUpdate: vi.fn().mockResolvedValue(undefined)
			},
			guildService: {
				getMixerSettings: vi.fn().mockResolvedValue({
					crossfadeEnabled: true,
					crossfadeMs: 5000
				}),
				getGuild: vi.fn().mockResolvedValue({
					volume: 50,
					repeat: 'off',
					sponsorBlockSegments: ['sponsor', 'intro']
				})
			},
			mixerService: {
				pushCrossfadeConfig: vi.fn().mockResolvedValue(undefined)
			}
		});
	});

	it('SegmentsLoaded 이벤트 수신 시 CustomPlayer에 세그먼트 목록을 기록한다', async () => {
		const sponsorHandler = new SponsorBlockHandler(lavalinkManager);
		void sponsorHandler;
		const segmentsLoadedCallback = lavalinkManager.on.mock.calls.find((call: [string, ...unknown[]]) => call[0] === 'SegmentsLoaded')?.[1];

		expect(segmentsLoadedCallback).toBeDefined();

		const segments = [
			{ category: 'sponsor', start: 54_000, end: 58_000 },
			{ category: 'intro', start: 0, end: 5_000 }
		];

		await segmentsLoadedCallback(player, null, { segments });

		expect(player.sponsorBlockSegments).toEqual(segments);
		expect(player.sponsorBlockCrossfadeSuppressed).toBe(false);
	});

	it('크로스페이드 지점(duration - crossfadeMs)과 겹치는 SponsorBlock 구간이 있고 재생 헤드가 접근하면 deleteSponsorBlock을 호출한다', async () => {
		const playerHandler = new PlayerHandler(lavalinkManager);
		player.sponsorBlockSegments = [{ category: 'outro', start: 54_000, end: 59_000 }];
		// duration: 60,000, crossfadeMs: 5,000 -> boundary: 55,000. position: 54,500
		Object.defineProperty(player, 'position', { value: 54_500, configurable: true });

		await (playerHandler as any).checkSponsorBlockCrossfadeOverlap(player);

		expect(player.deleteSponsorBlock).toHaveBeenCalledTimes(1);
		expect(player.sponsorBlockCrossfadeSuppressed).toBe(true);

		// 이미 억제(suppressed)되었으면 중복 호출하지 않는다
		await (playerHandler as any).checkSponsorBlockCrossfadeOverlap(player);
		expect(player.deleteSponsorBlock).toHaveBeenCalledTimes(1);
	});

	it('크로스페이드가 꺼져 있으면 SponsorBlock을 억제하지 않는다', async () => {
		const playerHandler = new PlayerHandler(lavalinkManager);
		(container.guildService.getMixerSettings as any).mockResolvedValueOnce({
			crossfadeEnabled: false,
			crossfadeMs: 5000
		});
		player.sponsorBlockSegments = [{ category: 'outro', start: 54_000, end: 59_000 }];
		Object.defineProperty(player, 'position', { value: 55_500, configurable: true });

		await (playerHandler as any).checkSponsorBlockCrossfadeOverlap(player);

		expect(player.deleteSponsorBlock).not.toHaveBeenCalled();
		expect(player.sponsorBlockCrossfadeSuppressed).toBe(false);
	});

	it('세그먼트가 크로스페이드 구간과 겹치지 않으면(앞부분) 억제하지 않는다', async () => {
		const playerHandler = new PlayerHandler(lavalinkManager);
		player.sponsorBlockSegments = [{ category: 'sponsor', start: 10_000, end: 20_000 }];
		Object.defineProperty(player, 'position', { value: 15_000, configurable: true });

		await (playerHandler as any).checkSponsorBlockCrossfadeOverlap(player);

		expect(player.deleteSponsorBlock).not.toHaveBeenCalled();
		expect(player.sponsorBlockCrossfadeSuppressed).toBe(false);
	});
});
