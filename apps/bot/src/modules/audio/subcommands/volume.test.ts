import { beforeEach, describe, expect, it, vi } from 'vitest';

import { run } from './volume.ts';

const { deferReply, editReply, getVolume, getTtsVolume, getTtsDuck, updateTtsDuck, updateVolume, updateTtsVolume, getPlayer } = vi.hoisted(() => ({
	deferReply: vi.fn(),
	editReply: vi.fn(),
	getVolume: vi.fn(),
	getTtsVolume: vi.fn(),
	getTtsDuck: vi.fn(),
	updateTtsDuck: vi.fn(),
	updateVolume: vi.fn(),
	updateTtsVolume: vi.fn(),
	getPlayer: vi.fn()
}));

vi.mock('@sapphire/framework', () => ({
	container: {
		guildService: { getVolume, getTtsVolume, getTtsDuck, updateTtsDuck, updateVolume, updateTtsVolume },
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
		user: { id: 'user' }
	};
}

describe('volume subcommand run', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		updateVolume.mockResolvedValue({ volume: 30 });
		updateTtsVolume.mockResolvedValue({ ttsVolume: 30 });
		updateTtsDuck.mockResolvedValue({ ttsDuckLevel: 0.3 });
		getPlayer.mockReturnValue({ setVolume: vi.fn() });
	});

	it('target=duck 입력(0~100)은 DB에 0~1 실수로 저장해요', async () => {
		await run(interaction('duck', 30) as unknown as Parameters<typeof run>[0]);
		expect(updateTtsDuck).toHaveBeenCalledWith('guild', 0.3);
	});

	it('target 없이 값만 주면 music으로 처리해요', async () => {
		await run(interaction(null, 30) as unknown as Parameters<typeof run>[0]);
		expect(updateVolume).toHaveBeenCalledWith('guild', 30);
		expect(updateTtsDuck).not.toHaveBeenCalled();
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
