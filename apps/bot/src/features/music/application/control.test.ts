import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../lib/appError.ts';
import type { MusicAccess } from './access.ts';
import type { Actor } from './actor.ts';
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
	const control = createMusicControl<FakePlayer>({
		access: { authorize },
		getPlayer: () => player ?? undefined,
		settings: { saveVolume }
	});
	return { control, player, authorize, saveVolume };
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
