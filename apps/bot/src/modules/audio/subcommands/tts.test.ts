import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Player } from 'lavalink-client';

const { announce, getPlayer } = vi.hoisted(() => ({ announce: vi.fn(), getPlayer: vi.fn() }));

vi.mock('@sapphire/framework', () => ({
	UserError: class UserError extends Error {
		public identifier: string;
		public context: unknown;
		public constructor(options: { identifier: string; message: string; context?: unknown }) {
			super(options.message);
			this.name = 'UserError';
			this.identifier = options.identifier;
			this.context = options.context;
		}
	},
	container: { audio: { getPlayer }, mixerService: { announce } }
}));

import { run } from './tts.ts';
import { MixerRequestError } from '../../../services/mixerService.ts';

function makeInteraction(text: string) {
	return {
		guildId: 'g1',
		options: { getString: () => text },
		deferReply: vi.fn(async () => undefined),
		editReply: vi.fn(async () => undefined)
	} as never;
}

function replyText(interaction: { editReply: ReturnType<typeof vi.fn> }): string {
	const payload = interaction.editReply.mock.calls[0][0] as { components: { toJSON(): unknown }[] };
	return JSON.stringify(payload.components[0].toJSON());
}

beforeEach(() => {
	vi.clearAllMocks();
	getPlayer.mockReturnValue({ guildId: 'g1' } as unknown as Player);
	announce.mockResolvedValue({ guildId: 'g1', id: 1, position: 1, queueLength: 1 });
});
afterEach(() => vi.unstubAllGlobals());

describe('music tts subcommand (queued announce)', () => {
	it('reports the queue position from the 202 receipt', async () => {
		announce.mockResolvedValue({ guildId: 'g1', id: 4, position: 2, queueLength: 2 });
		const interaction = makeInteraction('안녕하세요');

		await run(interaction as Parameters<typeof run>[0]);

		expect(replyText(interaction)).toContain('안내가 2번째로 예약됐어요.');
	});

	it('says 1st when the announcement is first in line', async () => {
		const interaction = makeInteraction('안녕하세요');

		await run(interaction as Parameters<typeof run>[0]);

		expect(replyText(interaction)).toContain('안내가 1번째로 예약됐어요.');
	});

	it('sends the text as a TTS URL with the overlay duck level', async () => {
		const interaction = makeInteraction('반가워요');

		await run(interaction as Parameters<typeof run>[0]);

		const [, identifier, duckLevel] = announce.mock.calls[0] as [Player, string, number];
		expect(identifier).toContain('translate.google.com');
		expect(identifier).toContain(encodeURIComponent('반가워요'));
		expect(duckLevel).toBe(0.2);
	});

	it('maps every announce failure to tts_mixer_failed — 409 is no longer "busy"', async () => {
		announce.mockRejectedValue(new MixerRequestError(409, 'mixer /mixer/announce -> 409'));
		const interaction = makeInteraction('안녕하세요');

		await expect(run(interaction as Parameters<typeof run>[0])).rejects.toMatchObject({
			identifier: 'tts_mixer_failed',
			message: expect.stringContaining('예약하지 못했어요')
		});
	});
});
