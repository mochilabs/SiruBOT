import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	AttachmentBuilder,
	Collection,
	MessageFlags,
	MessagePayload,
	type ButtonInteraction,
	type InteractionUpdateOptions,
	type Message
} from 'discord.js';
import { AppError } from '../../../lib/appError.ts';
import ControllerButtonHandler from './controllerButton.ts';
vi.mock('../../../services/guildSettings/channels.ts', async (orig) => ({
	...(await orig<Record<string, unknown>>()),
	...{ getPinnedChannel: mocks.pinned }
}));
vi.mock('../../../features/music/application/actor.ts', () => ({ actorFromMember: () => actor }));

const mocks = vi.hoisted(() => ({
	getPlayer: vi.fn(),
	allowed: vi.fn(),
	cached: vi.fn(),
	render: vi.fn(),
	pinned: vi.fn(),
	setVolume: vi.fn(),
	pause: vi.fn(),
	resume: vi.fn(),
	setRepeat: vi.fn(),
	stop: vi.fn(),
	skipNow: vi.fn(),
	previous: vi.fn()
}));
const actor = vi.hoisted(() => ({ guildId: 'guild', userId: 'user' }));
vi.mock('@sapphire/framework', () => ({
	InteractionHandler: class {
		container = {
			audio: { getPlayer: mocks.getPlayer },
			music: {
				setVolume: mocks.setVolume,
				pause: mocks.pause,
				resume: mocks.resume,
				setRepeat: mocks.setRepeat,
				stop: mocks.stop,
				skipNow: mocks.skipNow,
				previous: mocks.previous
			},
			guildService: {}
		};
	},
	InteractionHandlerTypes: { Button: 'button' },
	// controllerPayload 빌더가 직접 import하는 전역 container — pinned 조회만 필요하다.
	container: { guildService: {} }
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
		guild: {
			members: {
				me: { voice: { channelId: 'voice' } }
			}
		},
		member: {
			permissions: { has: vi.fn(() => false) },
			voice: { channel: { id: 'voice' }, channelId: 'voice' }
		},
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
		mocks.setVolume.mockImplementation(async (_actor: unknown, volume: number) => ({ volume, playing: true }));
	});

	it('updates a pause button without starting or waiting for image rendering', async () => {
		const { edit, updated, interaction, player, handler } = context();
		await handler.run(interaction as unknown as ButtonInteraction<'cached'>, { command: 'pause', subcommand: null });
		expect(mocks.pause).toHaveBeenCalledExactlyOnceWith(actor);
		expect(player.pause).not.toHaveBeenCalled();
		expect(edit).toHaveBeenCalledTimes(1);
		expect(edit.mock.calls[0]![0].files).toEqual([]);
		expect(player.controller).toBe(updated);
		expect(mocks.render).not.toHaveBeenCalled();
	});

	it('lets the use case refusal of a pause press reach the central error listener without touching the controller', async () => {
		const refusal = new AppError('forbidden', 'DJ만 가능해요.', { ephemeral: true });
		mocks.pause.mockRejectedValue(refusal);
		const { edit, interaction, handler } = context();
		await expect(handler.run(interaction as unknown as ButtonInteraction<'cached'>, { command: 'pause', subcommand: null })).rejects.toBe(
			refusal
		);
		expect(edit).not.toHaveBeenCalled();
		expect(mocks.cached).not.toHaveBeenCalled();
	});

	it('does not check DJ permission itself for pause and resume, the use case owns authorization', async () => {
		const { interaction, handler } = context();
		await handler.run(interaction as unknown as ButtonInteraction<'cached'>, { command: 'pause', subcommand: null });
		await handler.run(interaction as unknown as ButtonInteraction<'cached'>, { command: 'resume', subcommand: null });
		expect(mocks.allowed).not.toHaveBeenCalled();
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
		expect(mocks.resume).toHaveBeenCalledExactlyOnceWith(actor);
		expect(player.resume).not.toHaveBeenCalled();
		expect(edit).toHaveBeenCalledTimes(1);
		expect(player.controller).toBe(updated);
	});

	it('rejects button interaction when player does not exist', async () => {
		const { interaction, handler } = context();
		mocks.getPlayer.mockReturnValue(undefined);
		await handler.run(interaction as unknown as ButtonInteraction<'cached'>, { command: 'pause', subcommand: null });
		expect(interaction.reply).toHaveBeenCalledTimes(1);
	});

	it('prev button delegates to the use case without checking DJ permission itself and without editing the controller', async () => {
		const { edit, interaction, handler } = context();
		await handler.run(interaction as unknown as ButtonInteraction<'cached'>, { command: 'prev', subcommand: null });
		expect(mocks.previous).toHaveBeenCalledExactlyOnceWith(actor);
		expect(mocks.allowed).not.toHaveBeenCalled();
		expect(interaction.deferUpdate).toHaveBeenCalledOnce();
		expect(edit).not.toHaveBeenCalled();
	});

	it('lets the use case refusal of a prev press reach the central error listener', async () => {
		const refusal = new AppError('not_found', '이전에 재생한 곡이 없어요.', { ephemeral: true });
		mocks.previous.mockRejectedValue(refusal);
		const { interaction, handler } = context();
		await expect(handler.run(interaction as unknown as ButtonInteraction<'cached'>, { command: 'prev', subcommand: null })).rejects.toBe(refusal);
	});

	it('next button delegates skipping to the use case without checking DJ permission itself', async () => {
		const { edit, interaction, handler } = context();
		await handler.run(interaction as unknown as ButtonInteraction<'cached'>, { command: 'next', subcommand: null });
		expect(mocks.skipNow).toHaveBeenCalledExactlyOnceWith(actor);
		expect(mocks.allowed).not.toHaveBeenCalled();
		expect(interaction.deferUpdate).toHaveBeenCalledOnce();
		expect(edit).not.toHaveBeenCalled();
	});

	it('lets the use case refusal of a next press reach the central error listener', async () => {
		const refusal = new AppError('not_found', '대기열에 곡이 없어요.', { ephemeral: true });
		mocks.skipNow.mockRejectedValue(refusal);
		const { interaction, handler } = context();
		await expect(handler.run(interaction as unknown as ButtonInteraction<'cached'>, { command: 'next', subcommand: null })).rejects.toBe(refusal);
	});

	it('next button answers with the no-player guard message when the player is gone', async () => {
		const { interaction, handler } = context();
		mocks.getPlayer.mockReturnValue(undefined);
		await handler.run(interaction as unknown as ButtonInteraction<'cached'>, { command: 'next', subcommand: null });
		expect(interaction.reply).toHaveBeenCalledTimes(1);
		expect(mocks.skipNow).not.toHaveBeenCalled();
	});

	it('raises volume by the step and applies it', async () => {
		const { edit, interaction, handler } = context();
		await handler.run(interaction as unknown as ButtonInteraction<'cached'>, { command: 'volume', subcommand: 'up' });
		expect(mocks.setVolume).toHaveBeenCalledWith(actor, 50);
		expect(edit).toHaveBeenCalledTimes(1);
	});

	it('lowers volume by the step and applies it', async () => {
		const { edit, interaction, handler } = context();
		await handler.run(interaction as unknown as ButtonInteraction<'cached'>, { command: 'volume', subcommand: 'down' });
		expect(mocks.setVolume).toHaveBeenCalledWith(actor, 30);
		expect(edit).toHaveBeenCalledTimes(1);
	});

	it('clamps volume at the lower bound without applying a change', async () => {
		const { interaction, player, handler } = context();
		player.volume = 0;
		await handler.run(interaction as unknown as ButtonInteraction<'cached'>, { command: 'volume', subcommand: 'down' });
		expect(mocks.setVolume).not.toHaveBeenCalled();
		expect(interaction.reply).toHaveBeenCalledTimes(1);
	});

	it('lets the use case refusal of a volume press reach the central error listener without touching the controller', async () => {
		const refusal = new AppError('forbidden', 'DJ만 가능해요.', { ephemeral: true });
		mocks.setVolume.mockRejectedValue(refusal);
		const { edit, interaction, handler } = context();
		await expect(handler.run(interaction as unknown as ButtonInteraction<'cached'>, { command: 'volume', subcommand: 'up' })).rejects.toBe(
			refusal
		);
		expect(edit).not.toHaveBeenCalled();
	});

	it('does not check DJ permission itself for volume, the use case owns authorization', async () => {
		const { interaction, handler } = context();
		await handler.run(interaction as unknown as ButtonInteraction<'cached'>, { command: 'volume', subcommand: 'up' });
		expect(mocks.allowed).not.toHaveBeenCalled();
	});

	it.each([
		['track', 'track'],
		['queue', 'queue'],
		['off', 'off'],
		[null, 'off'],
		['bogus', 'off']
	])('repeat button %s sets the %s mode through the use case', async (subcommand, expected) => {
		const { edit, interaction, handler } = context();
		await handler.run(interaction as unknown as ButtonInteraction<'cached'>, { command: 'repeat', subcommand });
		expect(mocks.setRepeat).toHaveBeenCalledExactlyOnceWith(actor, expected);
		expect(mocks.allowed).not.toHaveBeenCalled();
		expect(edit).toHaveBeenCalledTimes(1);
	});

	it('stop button delegates stopping to the use case and replaces the clicked message with the stop view', async () => {
		const { edit, interaction, handler } = context();
		await handler.run(interaction as unknown as ButtonInteraction<'cached'>, { command: 'stop', subcommand: null });
		expect(mocks.stop).toHaveBeenCalledExactlyOnceWith(actor);
		expect(mocks.allowed).not.toHaveBeenCalled();
		expect(edit).toHaveBeenCalledTimes(1);
	});

	it('stop button falls back to a follow-up when the controller message is already gone', async () => {
		const { edit, interaction, handler } = context();
		edit.mockRejectedValue(Object.assign(new Error('Unknown Message'), { code: 10008 }));
		await handler.run(interaction as unknown as ButtonInteraction<'cached'>, { command: 'stop', subcommand: null });
		expect(interaction.followUp).toHaveBeenCalledTimes(1);
	});

	it('stop button does not touch the message when the use case refuses', async () => {
		const refusal = new AppError('forbidden', 'DJ만 가능해요.', { ephemeral: true });
		mocks.stop.mockRejectedValue(refusal);
		const { edit, interaction, handler } = context();
		await expect(handler.run(interaction as unknown as ButtonInteraction<'cached'>, { command: 'stop', subcommand: null })).rejects.toBe(refusal);
		expect(edit).not.toHaveBeenCalled();
	});

	it('opens the queue view with every control bound to the opener', async () => {
		const { interaction, player, handler } = context();
		const tracks = Array.from({ length: 12 }, (_, index) => ({
			info: { identifier: `id-${index}`, uri: `https://music/${index}`, title: `t${index}`, author: 'a', duration: 1000 },
			requester: { id: 'u' }
		}));
		Object.assign(player, { queue: { tracks, current: null, previous: [] } });
		Object.assign(interaction, { user: { id: '123456789012345678' } });
		await handler.run(interaction as unknown as ButtonInteraction<'cached'>, { command: 'queue', subcommand: 'view' });

		const json = JSON.stringify(interaction.reply.mock.calls[0]![0].components.map((component: { toJSON(): unknown }) => component.toJSON()));
		const ids = [...json.matchAll(/"custom_id":"([^"]+)"/g)].map((match) => match[1]!);
		expect(ids).toContain('queue:v1:sel:123456789012345678:1');
		expect(ids).toContain('queue:v1:page:123456789012345678:2');
		expect(ids.filter((id) => id.startsWith('queue:v1:') && id !== 'queue:v1:ind').every((id) => id.includes('123456789012345678'))).toBe(true);
	});

	it.each(['prev', 'next', 'remove', 'jumpTo'])('tells the user to reopen the queue for a legacy queue:%s button', async (subcommand) => {
		const { interaction, player, handler } = context();
		await handler.run(interaction as unknown as ButtonInteraction<'cached'>, { command: 'queue', subcommand });
		expect(interaction.reply).toHaveBeenCalledTimes(1);
		expect(interaction.reply.mock.calls[0]![0].flags).toContain(MessageFlags.Ephemeral);
		expect(player.pause).not.toHaveBeenCalled();
	});
});
