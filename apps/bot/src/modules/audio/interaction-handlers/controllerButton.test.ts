import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AttachmentBuilder, Collection, MessagePayload, type ButtonInteraction, type InteractionUpdateOptions, type Message } from 'discord.js';
import ControllerButtonHandler from './controllerButton.ts';

const mocks = vi.hoisted(() => ({ getPlayer: vi.fn(), allowed: vi.fn(), cached: vi.fn(), render: vi.fn() }));
vi.mock('@sapphire/framework', () => ({
	InteractionHandler: class {
		container = { audio: { getPlayer: mocks.getPlayer } };
	},
	InteractionHandlerTypes: { Button: 'button' }
}));
vi.mock('../utils/permissionCheck.ts', () => ({ checkDJOrAlone: mocks.allowed }));
vi.mock('../lavalink/player/nowPlayingCard.ts', () => ({ getCachedNowPlayingCard: mocks.cached, resolveNowPlayingCard: mocks.render }));
vi.mock('../view/controller.ts', () => ({ controllerView: () => ({}) }));

function context() {
	const original = { id: 'controller', attachments: new Collection<string, { id: string; name: string }>() };
	const updated = { ...original };
	const interaction = {
		guildId: 'guild',
		member: { voice: { channel: { id: 'voice' } } },
		message: original,
		update: vi.fn().mockResolvedValue({ resource: { message: updated } }),
		reply: vi.fn().mockResolvedValue(undefined)
	};
	const player = { voiceChannelId: 'voice', messageId: original.id, controller: original, pause: vi.fn().mockResolvedValue(undefined) };
	mocks.getPlayer.mockReturnValue(player);
	const handler = new ControllerButtonHandler(
		{} as ConstructorParameters<typeof ControllerButtonHandler>[0],
		{} as ConstructorParameters<typeof ControllerButtonHandler>[1]
	);
	return { original, updated, interaction, player, handler };
}

function attachmentIds(payload: InteractionUpdateOptions) {
	const target = { client: { options: { jsonTransformer: (value: unknown) => value } } } as unknown as Message;
	const body = new MessagePayload(target, payload).resolveBody().body;
	return body && 'attachments' in body ? body.attachments?.map((file) => file.id) : [];
}

describe('controller button cached rendering', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.allowed.mockResolvedValue(true);
		mocks.cached.mockReturnValue(null);
		mocks.render.mockImplementation(() => {
			throw new Error('button must not request an image');
		});
	});

	it('updates a pause button without starting or waiting for image rendering', async () => {
		const { updated, interaction, player, handler } = context();
		await handler.run(interaction as unknown as ButtonInteraction<'cached'>, { command: 'pause', subcommand: null });
		expect(player.pause).toHaveBeenCalledTimes(1);
		expect(interaction.update).toHaveBeenCalledTimes(1);
		expect(interaction.update.mock.calls[0]![0].files).toEqual([]);
		expect(player.controller).toBe(updated);
		expect(mocks.render).not.toHaveBeenCalled();
	});

	it('keeps permission checks ahead of playback changes', async () => {
		mocks.allowed.mockResolvedValue(false);
		const { interaction, player, handler } = context();
		await handler.run(interaction as unknown as ButtonInteraction<'cached'>, { command: 'pause', subcommand: null });
		expect(interaction.reply).toHaveBeenCalledTimes(1);
		expect(player.pause).not.toHaveBeenCalled();
		expect(mocks.cached).not.toHaveBeenCalled();
	});

	it('keeps an existing cached image without uploading it again', async () => {
		mocks.cached.mockReturnValue({ url: 'attachment://card.png', filename: 'card.png', file: new AttachmentBuilder(Buffer.from('card')) });
		const { original, interaction, handler } = context();
		original.attachments.set('attachment', { id: 'attachment', name: 'card.png' });
		await handler.run(interaction as unknown as ButtonInteraction<'cached'>, { command: 'pause', subcommand: null });
		expect(interaction.update.mock.calls[0]![0].files).toEqual([]);
		expect(attachmentIds(interaction.update.mock.calls[0]![0])).toEqual(['attachment']);
		expect(mocks.render).not.toHaveBeenCalled();
	});

	it('uploads a prepared image when this message does not have it yet', async () => {
		mocks.cached.mockReturnValue({ url: 'attachment://card.png', filename: 'card.png', file: new AttachmentBuilder(Buffer.from('card')) });
		const { interaction, handler } = context();
		await handler.run(interaction as unknown as ButtonInteraction<'cached'>, { command: 'pause', subcommand: null });
		expect(interaction.update.mock.calls[0]![0].files).toHaveLength(1);
	});

	it('drops a previous track attachment when uploading the prepared current card', async () => {
		mocks.cached.mockReturnValue({ url: 'attachment://card.png', filename: 'card.png', file: new AttachmentBuilder(Buffer.from('card')) });
		const { original, interaction, handler } = context();
		original.attachments.set('old', { id: 'old', name: 'old.png' });
		await handler.run(interaction as unknown as ButtonInteraction<'cached'>, { command: 'pause', subcommand: null });
		expect(attachmentIds(interaction.update.mock.calls[0]![0])).toEqual(['0']);
	});
});
