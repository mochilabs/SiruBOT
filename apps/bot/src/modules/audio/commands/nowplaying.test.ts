import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';
import { NowPlayingCommand } from './nowplaying.ts';

const mocks = vi.hoisted(() => ({ getPlayer: vi.fn(), sendController: vi.fn() }));
vi.mock('@sapphire/framework', () => ({ Command: class {} }));
vi.mock('@sapphire/decorators', () => ({ ApplyOptions: () => () => undefined }));
vi.mock('../view/nowplaying.ts', () => ({ nowplayingEmpty: () => ({}) }));

describe('nowplaying reply acknowledgement', () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it('acknowledges before waiting for the controller pipeline', async () => {
		const player = { queue: { current: {} } };
		mocks.getPlayer.mockReturnValue(player);
		mocks.sendController.mockResolvedValue(undefined);
		const interaction = { inCachedGuild: () => true, guildId: 'guild', deferReply: vi.fn().mockResolvedValue(undefined) };
		const command = { container: { audio: { getPlayer: mocks.getPlayer }, playerNotifier: { sendController: mocks.sendController } } };
		await NowPlayingCommand.prototype.chatInputRun.call(
			command as unknown as NowPlayingCommand,
			interaction as unknown as ChatInputCommandInteraction
		);
		expect(mocks.sendController).toHaveBeenCalledWith(player, interaction);
		expect(mocks.sendController.mock.invocationCallOrder[0]!).toBeGreaterThan(interaction.deferReply.mock.invocationCallOrder[0]!);
	});
});
