import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../lib/appError.ts';
import type { AiToolContext } from './types.ts';

const { getPlayer, checkDJOrAlone, reapplyMixerFilter, enqueueTrack, skip, getOrCreatePlayer, connectPlayer, ensurePlayback, search, music, actor } =
	vi.hoisted(() => ({
		music: {
			skipNow: vi.fn(),
			previous: vi.fn(),
			seek: vi.fn(),
			pause: vi.fn(),
			resume: vi.fn(),
			setVolume: vi.fn(),
			setRepeat: vi.fn(),
			stop: vi.fn()
		},
		actor: { guildId: 'g1', userId: 'u1' },
		getPlayer: vi.fn(),
		checkDJOrAlone: vi.fn(),
		reapplyMixerFilter: vi.fn(),
		enqueueTrack: vi.fn(),
		skip: vi.fn(),
		getOrCreatePlayer: vi.fn(),
		connectPlayer: vi.fn(),
		ensurePlayback: vi.fn(),
		search: vi.fn()
	}));

// 필터 프리셋(modules/audio/utils/filterPresets.ts)은 아직 container.mixerService를 직접 읽어요
vi.mock('@sapphire/framework', () => ({ container: { mixerService: { reapplyMixerFilter } } }));

const deps = {
	db: {} as never,
	guildService: {} as never,
	audioService: { enqueueTrack, getOrCreatePlayer, connectPlayer, ensurePlayback, search } as never,
	mixerService: { reapplyMixerFilter, skip } as never,
	playlistService: {} as never,
	getMusic: () => music as never,
	getAudio: () => ({ getPlayer }) as never
};
vi.mock('../../modules/audio/utils/permissionCheck.ts', () => ({ checkDJOrAlone }));
vi.mock('../../modules/audio/lavalink/autoPlayRelated.ts', () => ({ getUserQueuedTracks: vi.fn(), removeStaleRelatedTracks: vi.fn() }));
vi.mock('../../features/music/application/actor.ts', () => ({ actorFromMember: () => actor }));
vi.mock('../dataApiClient.ts', () => ({ searchLyrics: vi.fn() }));

import { createMusicTools } from './music.ts';

const musicTools = createMusicTools(deps);

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

describe('music_seek ai tool (시간 파싱 후 유스케이스 위임)', () => {
	const seekTool = tool('music_seek');
	const track = { info: { duration: 7_200_000, isStream: false, title: 't', author: 'a' } };

	it('"1:30"과 "90"을 밀리초로 해석해 유스케이스에 넘긴다', async () => {
		music.seek.mockImplementation(async (_actor: unknown, positionMs: number) => ({ positionMs, track }));

		expect(JSON.parse(await seekTool.execute({ time: '1:30' }, ctx))).toMatchObject({ status: 'ok', seeked_to_ms: 90_000 });
		expect(music.seek).toHaveBeenLastCalledWith(actor, 90_000);

		expect(JSON.parse(await seekTool.execute({ time: '0:45' }, ctx))).toMatchObject({ seeked_to_ms: 45_000 });
		expect(JSON.parse(await seekTool.execute({ time: '1:02:03' }, ctx))).toMatchObject({ seeked_to_ms: 3_723_000 });
	});

	it('파싱에 실패한 시간은 NaN으로 넘겨 유스케이스가 거절하게 한다', async () => {
		music.seek.mockRejectedValue(new AppError('invalid_input', '<:error:1> 올바른 시간 형식이 아니에요.'));
		await expect(seekTool.execute({ time: 'abc' }, ctx)).rejects.toThrow(new Error('올바른 시간 형식이 아니에요.'));
		expect(music.seek).toHaveBeenLastCalledWith(actor, Number.NaN);
	});

	it('DM이나 멤버 없는 컨텍스트에서는 유스케이스를 부르지 않는다', async () => {
		await expect(seekTool.execute({ time: '10' }, { ...ctx, member: null })).rejects.toThrow('DM에서는');
		expect(music.seek).not.toHaveBeenCalled();
	});
});

describe('music_pause ai tool (토글 어댑터)', () => {
	const pauseTool = tool('music_pause');

	it('재생 중이면 pause 유스케이스를 호출한다', async () => {
		getPlayer.mockReturnValue({ paused: false });
		music.pause.mockResolvedValue({ paused: true });
		expect(JSON.parse(await pauseTool.execute({}, ctx))).toEqual({ status: 'paused' });
		expect(music.pause).toHaveBeenCalledWith(actor);
		expect(music.resume).not.toHaveBeenCalled();
	});

	it('일시정지 중이면 resume 유스케이스를 호출한다', async () => {
		getPlayer.mockReturnValue({ paused: true });
		music.resume.mockResolvedValue({ resumed: true });
		expect(JSON.parse(await pauseTool.execute({}, ctx))).toEqual({ status: 'resumed' });
		expect(music.resume).toHaveBeenCalledWith(actor);
		expect(music.pause).not.toHaveBeenCalled();
	});

	it('유스케이스의 인가 거절을 안내 문구 Error로 전달한다', async () => {
		getPlayer.mockReturnValue({ paused: false });
		music.pause.mockRejectedValue(new AppError('forbidden', '<:volume_muted:1> DJ 역할이 필요해요.'));
		await expect(pauseTool.execute({}, ctx)).rejects.toThrow(new Error('DJ 역할이 필요해요.'));
	});
});

describe('music_stop ai tool', () => {
	it('유스케이스에 위임하고 stopped를 돌려준다', async () => {
		music.stop.mockResolvedValue({ stopped: true });
		expect(JSON.parse(await tool('music_stop').execute({}, ctx))).toEqual({ status: 'stopped' });
		expect(music.stop).toHaveBeenCalledWith(actor);
	});

	it('유스케이스의 거절을 안내 문구 Error로 전달한다', async () => {
		music.stop.mockRejectedValue(new AppError('not_found', '<:error:1> 재생 중인 곡이 없어요.'));
		await expect(tool('music_stop').execute({}, ctx)).rejects.toThrow(new Error('재생 중인 곡이 없어요.'));
	});
});

describe('music_volume / music_repeat ai tools', () => {
	it('볼륨을 주면 반올림해 유스케이스에 넘기고 결과를 돌려준다', async () => {
		music.setVolume.mockResolvedValue({ volume: 70, playing: true });
		expect(JSON.parse(await tool('music_volume').execute({ volume: 69.6 }, ctx))).toEqual({ status: 'ok', volume: 70, is_playing: true });
		expect(music.setVolume).toHaveBeenCalledWith(actor, 70);
	});

	it('반복 모드를 주면 유스케이스에 넘기고 저장된 모드를 돌려준다', async () => {
		music.setRepeat.mockResolvedValue({ mode: 'queue', playing: true });
		expect(JSON.parse(await tool('music_repeat').execute({ mode: 'queue' }, ctx))).toEqual({ status: 'ok', mode: 'queue' });
		expect(music.setRepeat).toHaveBeenCalledWith(actor, 'queue');
	});
});

describe('music_skip ai tool (즉시 건너뛰기 유스케이스 위임)', () => {
	const skipTool = tool('music_skip');

	it('유스케이스로 건너뛰고 다음 곡을 알려준다', async () => {
		const next = { info: { title: '다음 곡', author: '가수', duration: 1000, uri: 'u', artworkUrl: null } };
		getPlayer.mockReturnValue({ queue: { current: next }, transitionState: undefined });
		music.skipNow.mockResolvedValue({ skipped: true });
		const result = JSON.parse(await skipTool.execute({}, ctx));
		expect(music.skipNow).toHaveBeenCalledExactlyOnceWith(actor);
		expect(checkDJOrAlone).not.toHaveBeenCalled();
		expect(skip).not.toHaveBeenCalled();
		expect(result).toMatchObject({ status: 'ok', now_playing: { title: '다음 곡' } });
	});

	it('유스케이스의 거절은 안내 문구 그대로 도구 오류가 된다', async () => {
		music.skipNow.mockRejectedValue(new AppError('not_found', '<:error:1> 대기열에 곡이 없어요.'));
		await expect(skipTool.execute({}, ctx)).rejects.toThrow('대기열에 곡이 없어요.');
	});
});

describe('music_previous ai tool (이전곡 유스케이스 위임)', () => {
	const previousTool = tool('music_previous');

	it('유스케이스로 이전곡을 재생하고 그 곡을 알려준다', async () => {
		music.previous.mockResolvedValue({ track: { info: { title: '이전 곡', author: '가수', duration: 1000, uri: 'u', artworkUrl: null } } });
		const result = JSON.parse(await previousTool.execute({}, ctx));
		expect(music.previous).toHaveBeenCalledExactlyOnceWith(actor);
		expect(checkDJOrAlone).not.toHaveBeenCalled();
		expect(result).toMatchObject({ status: 'ok', playing: { title: '이전 곡' } });
	});

	it('유스케이스의 거절은 안내 문구 그대로 도구 오류가 된다', async () => {
		music.previous.mockRejectedValue(new AppError('not_found', '<:error:1> 이전에 재생한 곡이 없어요.'));
		await expect(previousTool.execute({}, ctx)).rejects.toThrow('이전에 재생한 곡이 없어요.');
	});
});
