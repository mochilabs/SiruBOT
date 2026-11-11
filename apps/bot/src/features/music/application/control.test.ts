import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../lib/appError.ts';
import type { MusicAccess } from './access.ts';
import type { Actor } from './actor.ts';
import { MUSIC_ACCESS_MESSAGES } from './access.ts';
import { createMusicControl, type MusicRepeatMode, type PlayerPort, type TrackPort } from './control.ts';

const actor: Actor = {
	guildId: 'guild',
	userId: 'user',
	voiceChannelId: 'vc',
	isAdministrator: false,
	roleIds: new Set<string>(),
	humansInVoiceChannel: 1
};

function track(overrides: Partial<TrackPort['info']> = {}): TrackPort {
	return { info: { duration: 200_000, isStream: false, title: '곡', ...overrides } };
}

class FakePlayer implements PlayerPort {
	public paused = false;
	public playing = true;
	public queue: { current: TrackPort | null; tracks: unknown[] } = { current: track(), tracks: [] };
	public readonly pause = vi.fn(async () => {
		this.paused = true;
	});
	public readonly resume = vi.fn(async () => {
		this.paused = false;
	});
	public readonly seek = vi.fn(async (_positionMs: number) => undefined);
	public readonly setVolume = vi.fn(async (_volume: number) => undefined);
	public readonly setRepeatMode = vi.fn(async (_mode: MusicRepeatMode) => undefined);
}

function harness(options: { player?: FakePlayer | null; denied?: AppError } = {}) {
	const player = options.player === undefined ? new FakePlayer() : options.player;
	const authorize = vi.fn<MusicAccess['authorize']>(async () => {
		if (options.denied) throw options.denied;
	});
	const saveVolume = vi.fn(async (_guildId: string, volume: number) => volume);
	const saveRepeat = vi.fn(async (_guildId: string, mode: MusicRepeatMode) => mode);
	const clearNext = vi.fn(async (_player: FakePlayer) => undefined);
	const ensurePlayback = vi.fn(async (_player: FakePlayer) => undefined);
	const control = createMusicControl<FakePlayer>({
		access: { authorize },
		getPlayer: () => player ?? undefined,
		settings: { saveVolume, saveRepeat },
		mixer: { clearNext },
		playback: { ensurePlayback }
	});
	return { control, player, authorize, saveVolume, saveRepeat, clearNext, ensurePlayback };
}

async function rejection(promise: Promise<unknown>): Promise<AppError> {
	const error = await promise.then(
		() => null,
		(thrown: unknown) => thrown
	);
	expect(error).toBeInstanceOf(AppError);
	return error as AppError;
}

describe('setVolume', () => {
	it('인가 뒤 저장하고 플레이어에 반영해요', async () => {
		const { control, player, authorize, saveVolume } = harness();
		await expect(control.setVolume(actor, 80)).resolves.toEqual({ volume: 80, playing: true });
		expect(authorize).toHaveBeenCalledWith(actor);
		expect(saveVolume).toHaveBeenCalledWith('guild', 80);
		expect(player!.setVolume).toHaveBeenCalledWith(80);
	});

	it('플레이어가 없어도 길드 볼륨을 저장하고 playing: false를 돌려줘요', async () => {
		const { control, saveVolume } = harness({ player: null });
		await expect(control.setVolume(actor, 30)).resolves.toEqual({ volume: 30, playing: false });
		expect(saveVolume).toHaveBeenCalledWith('guild', 30);
	});

	it('저장소가 돌려준 값을 플레이어에 적용해요', async () => {
		const { control, player, saveVolume } = harness();
		saveVolume.mockResolvedValueOnce(77);
		await expect(control.setVolume(actor, 80)).resolves.toEqual({ volume: 77, playing: true });
		expect(player!.setVolume).toHaveBeenCalledWith(77);
	});

	it.each([-1, 151, 10.5, Number.NaN, Number.POSITIVE_INFINITY])('범위 밖이거나 정수가 아닌 %s는 invalid_input으로 거절해요', async (value) => {
		const { control, player, saveVolume } = harness();
		const error = await rejection(control.setVolume(actor, value));
		expect(error.kind).toBe('invalid_input');
		expect(error.userMessage).toContain('**0**부터 **150**까지');
		expect(saveVolume).not.toHaveBeenCalled();
		expect(player!.setVolume).not.toHaveBeenCalled();
	});

	it.each([0, 150])('경계값 %s는 허용해요', async (value) => {
		const { control } = harness();
		await expect(control.setVolume(actor, value)).resolves.toMatchObject({ volume: value });
	});

	it('인가에 실패하면 아무것도 저장하지 않아요', async () => {
		const denied = new AppError('forbidden', 'DJ만 가능해요.');
		const { control, player, saveVolume } = harness({ denied });
		await expect(control.setVolume(actor, 50)).rejects.toBe(denied);
		expect(saveVolume).not.toHaveBeenCalled();
		expect(player!.setVolume).not.toHaveBeenCalled();
	});
});

describe('pause', () => {
	it('인가 뒤 재생 중인 곡을 일시정지해요', async () => {
		const { control, player, authorize } = harness();
		await expect(control.pause(actor)).resolves.toEqual({ paused: true });
		expect(authorize).toHaveBeenCalledWith(actor);
		expect(player!.pause).toHaveBeenCalledOnce();
	});

	it('이미 일시정지면 다시 호출하지 않고 성공해요', async () => {
		const player = new FakePlayer();
		player.paused = true;
		const { control } = harness({ player });
		await expect(control.pause(actor)).resolves.toEqual({ paused: true });
		expect(player.pause).not.toHaveBeenCalled();
	});

	it.each([
		['플레이어가 없으면', null],
		['현재 곡이 없으면', (() => Object.assign(new FakePlayer(), { queue: { current: null, tracks: [] } }))()]
	])('%s 곡 없음 문구로 거절해요', async (_label, player) => {
		const { control } = harness({ player });
		const error = await rejection(control.pause(actor));
		expect(error.kind).toBe('not_found');
		expect(error.userMessage).toBe(MUSIC_ACCESS_MESSAGES.noSong());
	});

	it('인가에 실패하면 플레이어를 건드리지 않아요', async () => {
		const denied = new AppError('forbidden', 'DJ만 가능해요.');
		const { control, player } = harness({ denied });
		await expect(control.pause(actor)).rejects.toBe(denied);
		expect(player!.pause).not.toHaveBeenCalled();
	});
});

describe('resume', () => {
	it('일시정지 중이면 재개해요', async () => {
		const player = new FakePlayer();
		player.paused = true;
		const { control, authorize, ensurePlayback } = harness({ player });
		await expect(control.resume(actor)).resolves.toEqual({ resumed: true });
		expect(authorize).toHaveBeenCalledWith(actor);
		expect(player.resume).toHaveBeenCalledOnce();
		expect(ensurePlayback).not.toHaveBeenCalled();
	});

	it('일시정지가 아닌데 재생도 안 하면 대기열 재생을 다시 시작해요', async () => {
		const player = new FakePlayer();
		player.playing = false;
		const { control, ensurePlayback } = harness({ player });
		await control.resume(actor);
		expect(ensurePlayback).toHaveBeenCalledWith(player);
		expect(player.resume).not.toHaveBeenCalled();
	});

	it('이미 재생 중이면 아무것도 하지 않고 성공해요', async () => {
		const { control, player, ensurePlayback } = harness();
		await expect(control.resume(actor)).resolves.toEqual({ resumed: true });
		expect(player!.resume).not.toHaveBeenCalled();
		expect(ensurePlayback).not.toHaveBeenCalled();
	});

	it('대기열이 비어 있으면 현재 곡이 없어도 대기열 곡으로 재생해요', async () => {
		const player = new FakePlayer();
		player.playing = false;
		player.queue = { current: null, tracks: [{}] };
		const { control, ensurePlayback } = harness({ player });
		await control.resume(actor);
		expect(ensurePlayback).toHaveBeenCalledWith(player);
	});

	it.each([
		['플레이어가 없으면', null],
		['현재 곡도 대기열도 없으면', (() => Object.assign(new FakePlayer(), { queue: { current: null, tracks: [] } }))()]
	])('%s 이어 재생할 곡이 없다고 거절해요', async (_label, player) => {
		const { control, ensurePlayback } = harness({ player });
		const error = await rejection(control.resume(actor));
		expect(error.kind).toBe('not_found');
		expect(error.userMessage).toContain('이어 재생할 곡이 없어요');
		expect(ensurePlayback).not.toHaveBeenCalled();
	});

	it('인가에 실패하면 플레이어를 건드리지 않아요', async () => {
		const denied = new AppError('forbidden', 'DJ만 가능해요.');
		const player = new FakePlayer();
		player.paused = true;
		const { control } = harness({ player, denied });
		await expect(control.resume(actor)).rejects.toBe(denied);
		expect(player.resume).not.toHaveBeenCalled();
	});
});

describe('setRepeat', () => {
	it.each(['off', 'track', 'queue'] as const)('%s를 저장하고 플레이어에 반영한 뒤 mixer 슬롯을 비워요', async (mode) => {
		const { control, player, authorize, saveRepeat, clearNext } = harness();
		await expect(control.setRepeat(actor, mode)).resolves.toEqual({ mode, playing: true });
		expect(authorize).toHaveBeenCalledWith(actor);
		expect(saveRepeat).toHaveBeenCalledWith('guild', mode);
		expect(player!.setRepeatMode).toHaveBeenCalledWith(mode);
		expect(clearNext).toHaveBeenCalledWith(player);
	});

	it('mixer 슬롯 정리가 실패해도 성공해요', async () => {
		const { control, clearNext } = harness();
		clearNext.mockRejectedValueOnce(new Error('mixer down'));
		await expect(control.setRepeat(actor, 'track')).resolves.toMatchObject({ mode: 'track' });
	});

	it('플레이어가 없으면 길드 설정만 저장해요', async () => {
		const { control, saveRepeat, clearNext } = harness({ player: null });
		await expect(control.setRepeat(actor, 'queue')).resolves.toEqual({ mode: 'queue', playing: false });
		expect(saveRepeat).toHaveBeenCalledWith('guild', 'queue');
		expect(clearNext).not.toHaveBeenCalled();
	});

	it('알 수 없는 모드는 invalid_input으로 거절하고 저장하지 않아요', async () => {
		const { control, saveRepeat, player } = harness();
		const error = await rejection(control.setRepeat(actor, 'shuffle'));
		expect(error.kind).toBe('invalid_input');
		expect(error.userMessage).toContain('잘못된 반복 모드 값이에요.');
		expect(saveRepeat).not.toHaveBeenCalled();
		expect(player!.setRepeatMode).not.toHaveBeenCalled();
	});

	it('인가에 실패하면 아무것도 저장하지 않아요', async () => {
		const denied = new AppError('forbidden', 'DJ만 가능해요.');
		const { control, saveRepeat } = harness({ denied });
		await expect(control.setRepeat(actor, 'track')).rejects.toBe(denied);
		expect(saveRepeat).not.toHaveBeenCalled();
	});
});
