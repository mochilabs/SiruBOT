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
	public queue: { current: TrackPort | null; tracks: unknown[] } = { current: track(), tracks: [{}] };
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
	const stopPlayback = vi.fn(async (_player: FakePlayer) => undefined);
	const removeController = vi.fn(async (_player: FakePlayer) => undefined);
	const skip = vi.fn(async (_player: FakePlayer, _position?: number) => undefined);
	const control = createMusicControl<FakePlayer>({
		access: { authorize },
		getPlayer: () => player ?? undefined,
		settings: { saveVolume, saveRepeat },
		mixer: { clearNext, skip },
		playback: { ensurePlayback, stopPlayback, removeController }
	});
	return { control, player, authorize, saveVolume, saveRepeat, clearNext, ensurePlayback, stopPlayback, removeController, skip };
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

describe('seek', () => {
	it('인가 뒤 곡 길이 안의 위치로 이동해요', async () => {
		const { control, player, authorize } = harness();
		const result = await control.seek(actor, 90_000);
		expect(authorize).toHaveBeenCalledWith(actor);
		expect(player!.seek).toHaveBeenCalledWith(90_000);
		expect(result).toEqual({ positionMs: 90_000, track: player!.queue.current });
	});

	it('곡 길이와 같은 위치와 0은 허용해요', async () => {
		const { control, player } = harness();
		await control.seek(actor, 200_000);
		await control.seek(actor, 0);
		expect(player!.seek).toHaveBeenCalledTimes(2);
	});

	it('곡 길이를 넘으면 거절해요', async () => {
		const { control, player } = harness();
		const error = await rejection(control.seek(actor, 200_001));
		expect(error.kind).toBe('invalid_input');
		expect(error.userMessage).toContain('곡의 길이를 초과하는 시간이에요.');
		expect(player!.seek).not.toHaveBeenCalled();
	});

	it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('비정상 값 %s는 시간 형식 오류로 거절해요', async (value) => {
		const { control, player } = harness();
		const error = await rejection(control.seek(actor, value));
		expect(error.kind).toBe('invalid_input');
		expect(error.userMessage).toContain('올바른 시간 형식이 아니에요.');
		expect(player!.seek).not.toHaveBeenCalled();
	});

	it('실시간 스트림은 시간 값보다 먼저 거절해요', async () => {
		const player = new FakePlayer();
		player.queue = { current: track({ isStream: true, duration: 0 }), tracks: [] };
		const { control } = harness({ player });
		const error = await rejection(control.seek(actor, Number.NaN));
		expect(error.userMessage).toContain('실시간 스트리밍에서는 탐색을 사용할 수 없어요.');
		expect(player.seek).not.toHaveBeenCalled();
	});

	it('현재 곡이 없으면 곡 없음 문구로 거절해요', async () => {
		const { control } = harness({ player: null });
		const error = await rejection(control.seek(actor, 10));
		expect(error.kind).toBe('not_found');
		expect(error.userMessage).toBe(MUSIC_ACCESS_MESSAGES.noSong());
	});

	it('인가에 실패하면 이동하지 않아요', async () => {
		const denied = new AppError('forbidden', 'DJ만 가능해요.');
		const { control, player } = harness({ denied });
		await expect(control.seek(actor, 10)).rejects.toBe(denied);
		expect(player!.seek).not.toHaveBeenCalled();
	});
});

describe('stop', () => {
	it('인가 뒤 컨트롤러를 지우고 정지해요', async () => {
		const { control, player, authorize, stopPlayback, removeController } = harness();
		const order: string[] = [];
		removeController.mockImplementation(async () => void order.push('removeController'));
		stopPlayback.mockImplementation(async () => void order.push('stopPlayback'));
		await expect(control.stop(actor)).resolves.toEqual({ stopped: true });
		expect(authorize).toHaveBeenCalledWith(actor);
		expect(removeController).toHaveBeenCalledWith(player);
		expect(stopPlayback).toHaveBeenCalledWith(player);
		expect(order).toEqual(['removeController', 'stopPlayback']);
	});

	it('컨트롤러 삭제가 실패해도 정지는 진행해요', async () => {
		const { control, removeController, stopPlayback } = harness();
		removeController.mockRejectedValueOnce(new Error('missing message'));
		await expect(control.stop(actor)).resolves.toEqual({ stopped: true });
		expect(stopPlayback).toHaveBeenCalledOnce();
	});

	it('현재 곡이 없어도 플레이어가 있으면 정지해요 (채팅 TTS만 켜진 경우)', async () => {
		const player = new FakePlayer();
		player.queue = { current: null, tracks: [] };
		const { control, stopPlayback } = harness({ player });
		await control.stop(actor);
		expect(stopPlayback).toHaveBeenCalledWith(player);
	});

	it('플레이어가 없으면 거절해요', async () => {
		const { control, stopPlayback } = harness({ player: null });
		const error = await rejection(control.stop(actor));
		expect(error.kind).toBe('not_found');
		expect(error.userMessage).toContain('재생 중인 곡이 없어요.');
		expect(stopPlayback).not.toHaveBeenCalled();
	});

	it('인가에 실패하면 컨트롤러도 지우지 않아요', async () => {
		const denied = new AppError('forbidden', 'DJ만 가능해요.');
		const { control, removeController, stopPlayback } = harness({ denied });
		await expect(control.stop(actor)).rejects.toBe(denied);
		expect(removeController).not.toHaveBeenCalled();
		expect(stopPlayback).not.toHaveBeenCalled();
	});
});

describe('skipNow', () => {
	it('인가 뒤 mixer 건너뛰기를 인자 없이 호출해요 (컨트롤러 버튼과 같은 호출)', async () => {
		const { control, player, authorize, skip } = harness();
		await expect(control.skipNow(actor)).resolves.toEqual({ skipped: true });
		expect(authorize).toHaveBeenCalledWith(actor);
		expect(skip).toHaveBeenCalledExactlyOnceWith(player, undefined);
	});

	it('to를 주면 그 번호를 mixer에 넘겨요', async () => {
		const player = new FakePlayer();
		player.queue = { current: track(), tracks: [{}, {}, {}] };
		const { control, skip } = harness({ player });
		await control.skipNow(actor, { to: 3 });
		expect(skip).toHaveBeenCalledExactlyOnceWith(player, 3);
	});

	it.each([0, -1, 1.5, Number.NaN])('올바르지 않은 to %s는 invalid_input으로 거절해요', async (to) => {
		const { control, skip } = harness();
		const error = await rejection(control.skipNow(actor, { to }));
		expect(error.kind).toBe('invalid_input');
		expect(error.userMessage).toContain('건너뛸 곡 번호가 올바르지 않아요.');
		expect(skip).not.toHaveBeenCalled();
	});

	it.each([
		['플레이어가 없으면', null],
		['현재 곡이 없으면', (() => Object.assign(new FakePlayer(), { queue: { current: null, tracks: [{}] } }))()]
	])('%s 곡 없음 문구로 거절해요', async (_label, player) => {
		const { control, skip } = harness({ player });
		const error = await rejection(control.skipNow(actor));
		expect(error.kind).toBe('not_found');
		expect(error.userMessage).toBe(MUSIC_ACCESS_MESSAGES.noSong());
		expect(skip).not.toHaveBeenCalled();
	});

	it('대기열이 비어 있으면 건너뛰지 않고 대기열 없음 문구로 거절해요', async () => {
		const player = new FakePlayer();
		player.queue = { current: track(), tracks: [] };
		const { control, skip } = harness({ player });
		const error = await rejection(control.skipNow(actor));
		expect(error.kind).toBe('not_found');
		expect(error.ephemeral).toBe(true);
		expect(error.userMessage).toContain('대기열에 곡이 없어요.');
		expect(skip).not.toHaveBeenCalled();
	});

	it('인가에 실패하면 건너뛰지 않아요', async () => {
		const denied = new AppError('forbidden', 'DJ만 가능해요.');
		const { control, skip } = harness({ denied });
		await expect(control.skipNow(actor)).rejects.toBe(denied);
		expect(skip).not.toHaveBeenCalled();
	});
});
