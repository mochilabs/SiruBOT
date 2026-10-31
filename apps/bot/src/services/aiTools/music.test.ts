import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiToolContext } from './types.ts';

const { getPlayer, checkDJOrAlone, reapplyMixerFilter, enqueueTrack, skip, getOrCreatePlayer, connectPlayer, ensurePlayback, search } = vi.hoisted(
	() => ({
		getPlayer: vi.fn(),
		checkDJOrAlone: vi.fn(),
		reapplyMixerFilter: vi.fn(),
		enqueueTrack: vi.fn(),
		skip: vi.fn(),
		getOrCreatePlayer: vi.fn(),
		connectPlayer: vi.fn(),
		ensurePlayback: vi.fn(),
		search: vi.fn()
	})
);

vi.mock('@sapphire/framework', () => ({
	container: {
		audio: { getPlayer },
		mixerService: { reapplyMixerFilter, skip },
		guildService: {},
		audioService: { enqueueTrack, getOrCreatePlayer, connectPlayer, ensurePlayback, search }
	}
}));
vi.mock('../../modules/audio/utils/permissionCheck.ts', () => ({ checkDJOrAlone }));
vi.mock('../../modules/audio/lavalink/autoPlayRelated.ts', () => ({ getUserQueuedTracks: vi.fn(), removeStaleRelatedTracks: vi.fn() }));
vi.mock('../dataApiClient.ts', () => ({ searchLyrics: vi.fn() }));

import { musicTools } from './music.ts';

function tool(name: string) {
	const found = musicTools.find((entry) => entry.name === name);
	if (!found) throw new Error(`${name} tool not registered`);
	return found;
}

const ctx = {
	guildId: 'g1',
	channelId: 'c1',
	voiceChannelId: 'v1',
	member: {} as AiToolContext['member'],
	userId: 'u1',
	username: 'user'
} satisfies AiToolContext;

beforeEach(() => {
	vi.clearAllMocks();
	checkDJOrAlone.mockResolvedValue(true);
	getPlayer.mockReturnValue({ guildId: 'g1' });
});
afterEach(() => vi.unstubAllGlobals());

describe('music_filter ai tool (프리셋 적용 계약)', () => {
	const filterTool = tool('music_filter');

	function makePlayer(overrides: Record<string, unknown> = {}) {
		return {
			guildId: 'g1',
			activeFilters: [] as string[],
			filterManager: {
				resetFilters: vi.fn(async () => undefined),
				clearEQ: vi.fn(async () => undefined),
				setEQ: vi.fn(async () => undefined),
				toggleNightcore: vi.fn(async () => undefined),
				toggleVaporwave: vi.fn(async () => undefined),
				toggleRotation: vi.fn(async () => undefined),
				toggleKaraoke: vi.fn(async () => undefined)
			},
			...overrides
		} as Record<string, any>;
	}

	it('프리셋을 켜면 전체 초기화 후 해당 필터만 적용한다 (EQ 게인 계약 포함)', async () => {
		const player = makePlayer();
		getPlayer.mockReturnValue(player);

		const result = JSON.parse(await filterTool.execute({ preset: 'bassboost' }, ctx));

		expect(player.filterManager.resetFilters).toHaveBeenCalled();
		expect(player.filterManager.clearEQ).toHaveBeenCalled();
		expect(reapplyMixerFilter).toHaveBeenCalledWith(player);
		expect(player.filterManager.setEQ).toHaveBeenCalledWith([
			{ band: 0, gain: 0.6 },
			{ band: 1, gain: 0.7 },
			{ band: 2, gain: 0.8 },
			{ band: 3, gain: 0.55 },
			{ band: 4, gain: 0.25 }
		]);
		expect(result).toEqual({ status: 'ok', preset: 'bassboost', enabled: true, active_filters: ['bassboost'] });
	});

	it('켜진 프리셋을 다시 보내면 끄고 남은 필터만 다시 적용한다', async () => {
		const player = makePlayer({ activeFilters: ['nightcore'] });
		getPlayer.mockReturnValue(player);

		const result = JSON.parse(await filterTool.execute({ preset: 'nightcore' }, ctx));

		expect(player.filterManager.toggleNightcore).not.toHaveBeenCalled();
		expect(result).toEqual({ status: 'ok', preset: 'nightcore', enabled: false, active_filters: [] });
	});

	it('nightcore와 vaporwave는 함께 남지 않는다 — 뒤에 온 쪽만 활성 목록에 남는다', async () => {
		const player = makePlayer({ activeFilters: ['nightcore'] });
		getPlayer.mockReturnValue(player);

		const result = JSON.parse(await filterTool.execute({ preset: 'vaporwave' }, ctx));

		// 초기화 후 둘 다 다시 적용되지만 timescale은 덮어써져 vaporwave가 살아남는다
		expect(player.filterManager.toggleNightcore).toHaveBeenCalled();
		expect(player.filterManager.toggleVaporwave).toHaveBeenCalled();
		expect(result.active_filters).toEqual(['vaporwave']);
		expect(player.activeFilters).toEqual(['vaporwave']);
	});

	it('reset은 모든 필터를 비운다', async () => {
		const player = makePlayer({ activeFilters: ['8d'] });
		getPlayer.mockReturnValue(player);

		const result = JSON.parse(await filterTool.execute({ preset: 'reset' }, ctx));

		expect(player.filterManager.resetFilters).toHaveBeenCalled();
		expect(result).toEqual({ status: 'ok', active_filters: [] });
		expect(player.activeFilters).toEqual([]);
	});

	it('알 수 없는 프리셋과 DJ 권한 없는 호출을 거절한다', async () => {
		getPlayer.mockReturnValue(makePlayer());

		await expect(filterTool.execute({ preset: 'boom' }, ctx)).rejects.toThrow('알 수 없는 필터 프리셋이에요.');

		checkDJOrAlone.mockResolvedValue(false);
		await expect(filterTool.execute({ preset: '8d' }, ctx)).rejects.toThrow('DJ 역할을 가지고 있거나');
	});
});

describe('music_play ai tool (재생/대기열 신호 계약)', () => {
	const playTool = tool('music_play');

	const requested = {
		info: {
			title: '제목',
			author: '가수',
			duration: 180_000,
			uri: 'https://youtu.be/x',
			artworkUrl: 'https://img/x.jpg',
			identifier: 'req-1'
		}
	};

	// nowPlayingTrack()이 읽는 단일 소스 — confirmedNowPlaying 우선, 없으면 queue.current 폴백
	function makePlayer(overrides: Record<string, unknown> = {}) {
		return {
			guildId: 'g1',
			queue: { tracks: [], current: null },
			transitionState: { confirmedNowPlaying: null },
			...overrides
		} as Record<string, any>;
	}

	beforeEach(() => {
		getOrCreatePlayer.mockResolvedValue(makePlayer());
		connectPlayer.mockResolvedValue(undefined);
		ensurePlayback.mockResolvedValue(undefined);
		search.mockResolvedValue({ loadType: 'track', tracks: [requested] });
	});

	it('확정된 nowPlaying이 신청 곡이면 action: playing과 전체 메타데이터를 돌려준다', async () => {
		enqueueTrack.mockResolvedValue({ wasIdle: true });
		getOrCreatePlayer.mockResolvedValue(makePlayer({ transitionState: { confirmedNowPlaying: requested } }));

		const result = JSON.parse(await playTool.execute({ query: '곡' }, ctx));

		expect(result).toEqual({
			status: 'ok',
			action: 'playing',
			track: { title: '제목', author: '가수', length_ms: 180_000, url: 'https://youtu.be/x', thumbnail: 'https://img/x.jpg' },
			queue_size: 0,
			queue_position: null
		});
	});

	it('다른 곡이 재생 중이고 신청 곡이 대기열에만 있으면 action: queued와 위치를 돌려준다', async () => {
		enqueueTrack.mockResolvedValue({ wasIdle: false });
		getOrCreatePlayer.mockResolvedValue(
			makePlayer({
				queue: { tracks: [{ info: { identifier: 'other-2' } }, requested] },
				transitionState: { confirmedNowPlaying: { info: { identifier: 'other-1' } } }
			})
		);

		const result = JSON.parse(await playTool.execute({ query: '곡' }, ctx));

		expect(result.action).toBe('queued');
		expect(result.queue_position).toBe(2);
		expect(result.track.title).toBe('제목');
	});

	it('추천곡 크로스페이드를 끊고 즉시 재생하는 경우에도(wasIdle:false) action: playing을 돌려준다', async () => {
		enqueueTrack.mockResolvedValue({ wasIdle: false });
		getOrCreatePlayer.mockResolvedValue(makePlayer({ transitionState: { confirmedNowPlaying: requested } }));

		const result = JSON.parse(await playTool.execute({ query: '곡' }, ctx));

		expect(result.action).toBe('playing');
		expect(result.queue_position).toBeNull();
	});
});

describe('music_seek ai tool (시간 파싱 계약)', () => {
	const seekTool = tool('music_seek');

	function makePlayer(overrides: Record<string, unknown> = {}) {
		return {
			guildId: 'g1',
			queue: { current: { info: { duration: 7_200_000, isStream: false, title: 't', author: 'a' } } },
			seek: vi.fn(async () => undefined),
			...overrides
		} as Record<string, any>;
	}

	it('"1:30"과 "90"을 밀리초로 해석해 이동한다', async () => {
		const player = makePlayer();
		getPlayer.mockReturnValue(player);

		expect(JSON.parse(await seekTool.execute({ time: '1:30' }, ctx))).toMatchObject({ status: 'ok', seeked_to_ms: 90_000 });
		expect(player.seek).toHaveBeenCalledWith(90_000);

		expect(JSON.parse(await seekTool.execute({ time: '0:45' }, ctx))).toMatchObject({ seeked_to_ms: 45_000 });
		expect(JSON.parse(await seekTool.execute({ time: '1:02:03' }, ctx))).toMatchObject({ seeked_to_ms: 3_723_000 });
	});

	it('잘못된 형식·곡 길이 초과·스트리밍·플레이어 부재를 거절한다', async () => {
		const player = makePlayer();
		getPlayer.mockReturnValue(player);

		await expect(seekTool.execute({ time: 'abc' }, ctx)).rejects.toThrow('시간 형식이 잘못됐어요.');
		await expect(seekTool.execute({ time: '4:00:00' }, ctx)).rejects.toThrow('곡의 길이를 초과하는 시간이에요.');

		getPlayer.mockReturnValue(makePlayer({ queue: { current: { info: { duration: 0, isStream: true } } } }));
		await expect(seekTool.execute({ time: '10' }, ctx)).rejects.toThrow('실시간 스트리밍에서는 이동할 수 없어요.');

		getPlayer.mockReturnValue(undefined);
		await expect(seekTool.execute({ time: '10' }, ctx)).rejects.toThrow('현재 재생 중인 곡이 없어요.');
	});
});
