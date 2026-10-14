import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AttachmentBuilder, Collection, MessagePayload, type ButtonInteraction, type InteractionUpdateOptions, type Message } from 'discord.js';
import ControllerButtonHandler from './controllerButton.ts';

const mocks = vi.hoisted(() => ({ getPlayer: vi.fn(), allowed: vi.fn(), cached: vi.fn(), render: vi.fn(), updateVolume: vi.fn(), pinned: vi.fn() }));
vi.mock('@sapphire/framework', () => ({
	InteractionHandler: class {
		container = {
			audio: { getPlayer: mocks.getPlayer },
			guildService: { updateVolume: mocks.updateVolume }
		};
	},
	InteractionHandlerTypes: { Button: 'button' },
	// controllerPayload 빌더가 직접 import하는 전역 container — pinned 조회만 필요하다.
	container: { guildService: { getPinnedChannel: mocks.pinned } }
}));
vi.mock('../utils/permissionCheck.ts', () => ({ checkDJOrAlone: mocks.allowed }));
vi.mock('../lavalink/player/nowPlayingCard.ts', () => ({
	getCachedNowPlayingCard: mocks.cached,
	getDisplayNowPlayingCard: mocks.cached,
	resolveNowPlayingCard: mocks.render
}));
vi.mock('../view/controller.ts', () => ({ controllerView: () => ({}) }));

function context() {
	const original = { id: 'controller', channelId: 'controller-channel', attachments: new Collection<string, { id: string; name: string }>() };
	const updated = { ...original };
	const edit = vi.fn().mockResolvedValue(updated);
	const interaction = {
		guildId: 'guild',
		member: { voice: { channel: { id: 'voice' } } },
		deferred: true,
		message: { ...original, edit },
		deferUpdate: vi.fn().mockResolvedValue(undefined),
		reply: vi.fn().mockResolvedValue(undefined),
		followUp: vi.fn().mockResolvedValue(undefined)
	};
	const player = {
		voiceChannelId: 'voice',
		messageId: original.id,
		controller: original,
		volume: 40,
		pause: vi.fn().mockResolvedValue(undefined),
		resume: vi.fn().mockResolvedValue(undefined),
		setVolume: vi.fn()
	};
	mocks.getPlayer.mockReturnValue(player);
	const handler = new ControllerButtonHandler(
		{} as ConstructorParameters<typeof ControllerButtonHandler>[0],
		{} as ConstructorParameters<typeof ControllerButtonHandler>[1]
	);
	return { original, updated, edit, interaction, player, handler };
}

function attachmentIds(payload: InteractionUpdateOptions) {
	const target = { client: { options: { jsonTransformer: (value: unknown) => value } } } as unknown as Message;
	const body = new MessagePayload(target, payload).resolveBody().body;
	return body && 'attachments' in body ? body.attachments?.map((file: any) => file.id) : [];
}

describe('controller button cached rendering', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.allowed.mockResolvedValue(true);
		mocks.cached.mockReturnValue(null);
		mocks.pinned.mockResolvedValue(null);
		mocks.render.mockImplementation(() => {
			throw new Error('button must not request an image');
		});
		mocks.updateVolume.mockImplementation(async (_guildId: string, volume: number) => ({ volume }));
	});

	it('updates a pause button without starting or waiting for image rendering', async () => {
		const { edit, updated, interaction, player, handler } = context();
		await handler.run(interaction as unknown as ButtonInteraction<'cached'>, { command: 'pause', subcommand: null });
		expect(player.pause).toHaveBeenCalledTimes(1);
		expect(edit).toHaveBeenCalledTimes(1);
		expect(edit.mock.calls[0]![0].files).toEqual([]);
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
		// 컨트롤러가 떠 있는 채널이 길드의 고정 채널이어야 카드가 붙는다.
		mocks.pinned.mockResolvedValue('controller-channel');
		const { edit, interaction, handler } = context();
		const original = (interaction as unknown as { message: { attachments: Collection<string, { id: string; name: string }> } }).message;
		original.attachments.set('attachment', { id: 'attachment', name: 'card.png' });
		await handler.run(interaction as unknown as ButtonInteraction<'cached'>, { command: 'pause', subcommand: null });
		expect(edit.mock.calls[0]![0].files).toEqual([]);
		expect(attachmentIds(edit.mock.calls[0]![0])).toEqual(['attachment']);
		expect(mocks.render).not.toHaveBeenCalled();
	});

	it('uploads a prepared image when this message does not have it yet', async () => {
		mocks.cached.mockReturnValue({ url: 'attachment://card.png', filename: 'card.png', file: new AttachmentBuilder(Buffer.from('card')) });
		mocks.pinned.mockResolvedValue('controller-channel');
		const { edit, interaction, handler } = context();
		await handler.run(interaction as unknown as ButtonInteraction<'cached'>, { command: 'pause', subcommand: null });
		expect(edit.mock.calls[0]![0].files).toHaveLength(1);
	});

	it('drops a previous track attachment when uploading the prepared current card', async () => {
		mocks.cached.mockReturnValue({ url: 'attachment://card.png', filename: 'card.png', file: new AttachmentBuilder(Buffer.from('card')) });
		mocks.pinned.mockResolvedValue('controller-channel');
		const { edit, interaction, handler } = context();
		const original = (interaction as unknown as { message: { attachments: Collection<string, { id: string; name: string }> } }).message;
		original.attachments.set('old', { id: 'old', name: 'old.png' });
		await handler.run(interaction as unknown as ButtonInteraction<'cached'>, { command: 'pause', subcommand: null });
		expect(attachmentIds(edit.mock.calls[0]![0])).toEqual(['0']);
	});

	it('handles resume button correctly', async () => {
		const { edit, updated, interaction, player, handler } = context();
		await handler.run(interaction as unknown as ButtonInteraction<'cached'>, { command: 'resume', subcommand: null });
		expect(player.resume).toHaveBeenCalledTimes(1);
		expect(edit).toHaveBeenCalledTimes(1);
		expect(player.controller).toBe(updated);
	});

	it('rejects button interaction when member is in a different voice channel', async () => {
		const { interaction, player, handler } = context();
		(interaction.member.voice.channel as any).id = 'other-voice';
		await handler.run(interaction as unknown as ButtonInteraction<'cached'>, { command: 'pause', subcommand: null });
		expect(interaction.reply).toHaveBeenCalledTimes(1);
		expect(player.pause).not.toHaveBeenCalled();
	});

	it('rejects button interaction when player does not exist', async () => {
		const { interaction, handler } = context();
		mocks.getPlayer.mockReturnValue(undefined);
		await handler.run(interaction as unknown as ButtonInteraction<'cached'>, { command: 'pause', subcommand: null });
		expect(interaction.reply).toHaveBeenCalledTimes(1);
	});

	it('checks DJ permission for DJ commands (stop, next, prev, repeat, volume)', async () => {
		mocks.allowed.mockResolvedValue(false);
		const { interaction, player, handler } = context();
		for (const cmd of ['resume', 'stop', 'prev', 'next', 'repeat', 'volume']) {
			vi.clearAllMocks();
			mocks.allowed.mockResolvedValue(false);
			await handler.run(interaction as unknown as ButtonInteraction<'cached'>, { command: cmd, subcommand: null });
			expect(interaction.reply).toHaveBeenCalledTimes(1);
			expect(player.pause).not.toHaveBeenCalled();
			expect(player.resume).not.toHaveBeenCalled();
			expect(player.setVolume).not.toHaveBeenCalled();
		}
	});

	it('raises volume by the step and applies it', async () => {
		const { edit, interaction, player, handler } = context();
		await handler.run(interaction as unknown as ButtonInteraction<'cached'>, { command: 'volume', subcommand: 'up' });
		expect(mocks.updateVolume).toHaveBeenCalledWith('guild', 50);
		expect(player.setVolume).toHaveBeenCalledWith(50);
		expect(edit).toHaveBeenCalledTimes(1);
	});

	it('lowers volume by the step and applies it', async () => {
		const { edit, interaction, player, handler } = context();
		await handler.run(interaction as unknown as ButtonInteraction<'cached'>, { command: 'volume', subcommand: 'down' });
		expect(mocks.updateVolume).toHaveBeenCalledWith('guild', 30);
		expect(player.setVolume).toHaveBeenCalledWith(30);
		expect(edit).toHaveBeenCalledTimes(1);
	});

	it('clamps volume at the lower bound without applying a change', async () => {
		const { interaction, player, handler } = context();
		player.volume = 0;
		await handler.run(interaction as unknown as ButtonInteraction<'cached'>, { command: 'volume', subcommand: 'down' });
		expect(mocks.updateVolume).not.toHaveBeenCalled();
		expect(player.setVolume).not.toHaveBeenCalled();
		expect(interaction.reply).toHaveBeenCalledTimes(1);
	});
});
