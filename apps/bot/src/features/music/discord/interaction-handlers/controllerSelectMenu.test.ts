import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type StringSelectMenuInteraction } from 'discord.js';
import ControllerSelectMenuHandler from './controllerSelectMenu.ts';
import { decodeQueueSelectId, queueViewId } from '../utils/queueViewId.ts';

const mocks = vi.hoisted(() => ({
	getPlayer: vi.fn(),
	allowed: vi.fn(),
	resolveQueueSelection: vi.fn(),
	getUserQueuedTracks: vi.fn(),
	queueList: vi.fn(() => ({}))
}));

vi.mock('@sapphire/framework', () => ({
	InteractionHandler: class {
		some = (value: unknown) => ({ isSome: () => true, unwrap: () => value });
		none = () => ({ isSome: () => false });
		container = {
			audio: { getPlayer: mocks.getPlayer }
		};
	},
	InteractionHandlerTypes: { SelectMenu: 'select-menu' },
	UserError: class UserError extends Error {}
}));
// 음성 채널 조건은 픽스처 멤버로 판정해요 — 권한 보유자(permissions.has)는 원격 권한자로 면제돼요. 정책 자체는 access.test.ts가 검증해요.
vi.mock('../utils/permissionCheck.ts', () => ({
	checkDJOrAlone: mocks.allowed,
	checkInBotVoice: async (
		_guildId: string,
		member: { permissions: { has(): boolean }; voice: { channelId: string | null } },
		botVoiceChannelId: string | null
	) => member.permissions.has() || (member.voice.channelId !== null && (botVoiceChannelId === null || member.voice.channelId === botVoiceChannelId))
}));
vi.mock('../utils/queueSelection.ts', () => ({ resolveQueueSelection: mocks.resolveQueueSelection }));
vi.mock('../../lavalink/autoPlayRelated.ts', () => ({ getUserQueuedTracks: mocks.getUserQueuedTracks }));
vi.mock('../views/queue.ts', () => ({
	queueList: mocks.queueList,
	QUEUE_PAGE_SIZE: 10
}));

function context() {
	const interaction = {
		customId: queueViewId.encode('sel', { ownerId: '123456789012345678', page: 1 }),
		values: ['1.0123456789abcdef'],
		guildId: 'guild',
		user: { id: '123456789012345678' },
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
		voiceChannelId: 'voice'
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

		await handler.run(interaction as unknown as StringSelectMenuInteraction<'cached'>, {
			view: decodeQueueSelectId(interaction.customId)!,
			selectedValue: '1.0123456789abcdef'
		});
		expect(interaction.reply).toHaveBeenCalledTimes(1);
		expect(interaction.update).not.toHaveBeenCalled();
	});

	it('allows administrators to use select menu even when not in voice channel', async () => {
		const { interaction, handler } = context();
		interaction.member.permissions.has.mockReturnValue(true);
		interaction.member.voice.channelId = null as unknown as string;
		interaction.member.voice.channel = null as unknown as { id: string };

		await handler.run(interaction as unknown as StringSelectMenuInteraction<'cached'>, {
			view: decodeQueueSelectId(interaction.customId)!,
			selectedValue: '1.0123456789abcdef'
		});
		expect(interaction.reply).not.toHaveBeenCalled();
		expect(interaction.update).toHaveBeenCalledTimes(1);
	});

	it('renders the page of the selected track and carries the owner in the new view', async () => {
		const { interaction, handler } = context();
		mocks.getUserQueuedTracks.mockReturnValue(Array.from({ length: 25 }, () => ({ info: { title: 't' } })));
		mocks.resolveQueueSelection.mockReturnValue(14);

		await handler.run(interaction as unknown as StringSelectMenuInteraction<'cached'>, {
			view: decodeQueueSelectId(interaction.customId)!,
			selectedValue: 'x'
		});
		expect(mocks.queueList).toHaveBeenCalledWith(
			expect.objectContaining({ page: 2, totalPages: 3, authorId: '123456789012345678', selectedIndex: 14 })
		);
	});

	it('rejects a select from someone who did not open the view, without touching the player', async () => {
		const { interaction, handler } = context();
		interaction.customId = queueViewId.encode('sel', { ownerId: '987654321098765432', page: 1 });

		await handler.run(interaction as unknown as StringSelectMenuInteraction<'cached'>, {
			view: decodeQueueSelectId(interaction.customId)!,
			selectedValue: 'x'
		});
		expect(interaction.reply).toHaveBeenCalledTimes(1);
		expect(interaction.update).not.toHaveBeenCalled();
		expect(mocks.resolveQueueSelection).not.toHaveBeenCalled();
	});

	it('parses the id the view encodes and ignores legacy ids', () => {
		const { handler } = context();
		const parse = (customId: string) =>
			handler.parse({ customId, values: ['x'], inCachedGuild: () => true } as unknown as StringSelectMenuInteraction);
		const parsed = parse(queueViewId.encode('sel', { ownerId: '123456789012345678', page: 2 }));
		expect(parsed.isSome() && parsed.unwrap()).toEqual({ view: { action: 'sel', ownerId: '123456789012345678', page: 2 }, selectedValue: 'x' });
		expect(parse('controller:queue:select').isSome()).toBe(false);
		expect(parse(queueViewId.encode('page', { ownerId: '123456789012345678', page: 2 })).isSome()).toBe(false);
	});
});
