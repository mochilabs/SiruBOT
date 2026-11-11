import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '../../../lib/appError.ts';
import { run } from './volume.ts';
vi.mock('../../../services/guildSettings/playback.ts', () => ({ getVolume, getTtsVolume, getTtsDuck, updateTtsDuck, updateVolume, updateTtsVolume }));

const { deferReply, editReply, getVolume, getTtsVolume, getTtsDuck, updateTtsDuck, updateVolume, updateTtsVolume, getPlayer, setVolume } = vi.hoisted(
	() => ({
		deferReply: vi.fn(),
		editReply: vi.fn(),
		getVolume: vi.fn(),
		getTtsVolume: vi.fn(),
		getTtsDuck: vi.fn(),
		updateTtsDuck: vi.fn(),
		updateVolume: vi.fn(),
		updateTtsVolume: vi.fn(),
		getPlayer: vi.fn(),
		setVolume: vi.fn()
	})
);
const actor = vi.hoisted(() => ({ guildId: 'guild', userId: 'user' }));
vi.mock('../../../features/music/application/actor.ts', () => ({ actorFromMember: () => actor }));

vi.mock('@sapphire/framework', () => ({
	container: {
		guildService: {},
		music: { setVolume },
		audio: { getPlayer }
	},
	UserError: class extends Error {
		public constructor(public readonly options: { identifier: string; message: string; context?: unknown }) {
			super(options.message);
		}
	}
}));
vi.mock('@sirubot/utils', () => ({
	emoji: () => '',
	emojiProgressBar: () => 'PB',
	volumeToEmoji: () => '',
	DEFAULT_COLOR: 0
}));

function interaction(target: string | null, volume: number | null) {
	return {
		guildId: 'guild',
		deferReply,
		editReply,
		options: {
			getString: vi.fn().mockReturnValue(target),
			getInteger: vi.fn().mockReturnValue(volume)
		},
		member: {},
		user: { id: 'user' }
	};
}

describe('volume subcommand run', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setVolume.mockResolvedValue({ volume: 30, playing: true });
		updateTtsVolume.mockResolvedValue({ ttsVolume: 30 });
		updateTtsDuck.mockResolvedValue({ ttsDuckLevel: 0.3 });
		getPlayer.mockReturnValue({ setVolume: vi.fn() });
	});

	it('target=duck 입력(0~100)은 DB에 0~1 실수로 저장해요', async () => {
		await run(interaction('duck', 30) as unknown as Parameters<typeof run>[0]);
		expect(updateTtsDuck).toHaveBeenCalledWith(expect.anything(), 'guild', 0.3);
	});

	it('target 없이 값만 주면 music으로 처리해 유스케이스에 맡겨요', async () => {
		await run(interaction(null, 30) as unknown as Parameters<typeof run>[0]);
		expect(setVolume).toHaveBeenCalledWith(actor, 30);
		expect(updateVolume).not.toHaveBeenCalled();
		expect(updateTtsDuck).not.toHaveBeenCalled();
		expect(editReply).toHaveBeenCalled();
	});

	it('music 유스케이스의 거절은 그대로 던져 중앙 오류 처리가 보여주게 해요', async () => {
		const refusal = new AppError('forbidden', 'DJ만 가능해요.');
		setVolume.mockRejectedValue(refusal);
		await expect(run(interaction('music', 30) as unknown as Parameters<typeof run>[0])).rejects.toBe(refusal);
		expect(editReply).not.toHaveBeenCalled();
	});

	it('target=tts는 유스케이스를 거치지 않고 TTS 볼륨만 저장해요', async () => {
		await run(interaction('tts', 30) as unknown as Parameters<typeof run>[0]);
		expect(updateTtsVolume).toHaveBeenCalledWith(expect.anything(), 'guild', 30);
		expect(setVolume).not.toHaveBeenCalled();
	});

	it('값 없이 호출하면 세 값 모두 조회해서 개요를 보여줘요', async () => {
		getVolume.mockResolvedValue(50);
		getTtsVolume.mockResolvedValue(80);
		getTtsDuck.mockResolvedValue(0.25);

		await run(interaction(null, null) as unknown as Parameters<typeof run>[0]);
		expect(updateVolume).not.toHaveBeenCalled();
		expect(updateTtsVolume).not.toHaveBeenCalled();
		expect(updateTtsDuck).not.toHaveBeenCalled();
		expect(editReply).toHaveBeenCalled();
	});

	it('각 target 최대치를 넘으면 volume_invalid 에러를 던져요', async () => {
		await expect(run(interaction('duck', 150) as unknown as Parameters<typeof run>[0])).rejects.toMatchObject({
			options: { identifier: 'volume_invalid' }
		});
	});
});
