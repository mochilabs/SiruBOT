import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type StringSelectMenuInteraction } from 'discord.js';
import ControllerSelectMenuHandler from './controllerSelectMenu.ts';

const mocks = vi.hoisted(() => ({
	getPlayer: vi.fn(),
	allowed: vi.fn(),
	resolveQueueSelection: vi.fn(),
	getUserQueuedTracks: vi.fn()
}));

vi.mock('@sapphire/framework', () => ({
	InteractionHandler: class {
		container = {
			audio: { getPlayer: mocks.getPlayer }
		};
	},
	InteractionHandlerTypes: { SelectMenu: 'select-menu' }
}));
vi.mock('../utils/permissionCheck.ts', () => ({ checkDJOrAlone: mocks.allowed }));
vi.mock('../utils/queueSelection.ts', () => ({ resolveQueueSelection: mocks.resolveQueueSelection }));
vi.mock('../lavalink/autoPlayRelated.ts', () => ({ getUserQueuedTracks: mocks.getUserQueuedTracks }));
vi.mock('../view/queue.ts', () => ({
	queueList: () => ({}),
	queueSelectCustomId: 'queue:select',
	QUEUE_PAGE_SIZE: 10
}));

function context() {
	const interaction = {
		guildId: 'guild',
		user: { id: 'user-id' },
		guild: {
			members: {
				me: { voice: { channelId: 'voice' } }
			}
		},
		member: {
			permissions: { has: vi.fn(() => false) },
			voice: { channel: { id: 'voice' }, channelId: 'voice' }
		},
		reply: vi.fn().mockResolvedValue(undefined),
		update: vi.fn().mockResolvedValue(undefined)
	};
	const player = {
		voiceChannelId: 'voice',
		queueSelectedIndex: null,
		queuePage: 1
	};
	mocks.getPlayer.mockReturnValue(player);
	mocks.allowed.mockResolvedValue(true);
	mocks.getUserQueuedTracks.mockReturnValue([{ info: { title: 'Track 1' } }]);
	mocks.resolveQueueSelection.mockReturnValue(0);

	const handler = new ControllerSelectMenuHandler(
		{} as ConstructorParameters<typeof ControllerSelectMenuHandler>[0],
		{} as ConstructorParameters<typeof ControllerSelectMenuHandler>[1]
	);
	return { interaction, player, handler };
}

describe('controller select menu voice & admin checks', () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it('rejects interaction when user is in a different voice channel', async () => {
		const { interaction, handler } = context();
		interaction.member.voice.channelId = 'other-voice';
		interaction.member.voice.channel.id = 'other-voice';

		await handler.run(interaction as unknown as StringSelectMenuInteraction<'cached'>, { selectedValue: '0' });
		expect(interaction.reply).toHaveBeenCalledTimes(1);
		expect(interaction.update).not.toHaveBeenCalled();
	});

	it('allows administrators to use select menu even when not in voice channel', async () => {
		const { interaction, handler } = context();
		interaction.member.permissions.has.mockReturnValue(true);
		interaction.member.voice.channelId = null as unknown as string;
		interaction.member.voice.channel = null as unknown as { id: string };

		await handler.run(interaction as unknown as StringSelectMenuInteraction<'cached'>, { selectedValue: '0' });
		expect(interaction.reply).not.toHaveBeenCalled();
		expect(interaction.update).toHaveBeenCalledTimes(1);
	});
});
