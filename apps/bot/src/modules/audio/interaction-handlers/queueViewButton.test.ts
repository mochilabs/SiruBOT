import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ButtonInteraction, StringSelectMenuInteraction } from 'discord.js';
import QueueViewButtonHandler from './queueViewButton.ts';
import ControllerSelectMenuHandler from './controllerSelectMenu.ts';
import { queueList } from '../view/queue.ts';
import { queueSelectionValue } from '../utils/queueSelection.ts';
import { queueViewId } from '../utils/queueViewId.ts';

const mocks = vi.hoisted(() => ({ getPlayer: vi.fn(), allowed: vi.fn(), skip: vi.fn(), preload: vi.fn() }));

vi.mock('@sapphire/framework', () => ({
	InteractionHandler: class {
		some = (value: unknown) => ({ isSome: () => true, unwrap: () => value });
		none = () => ({ isSome: () => false });
		container = {
			audio: { getPlayer: mocks.getPlayer },
			mixerService: { skip: mocks.skip, preloadUpcoming: mocks.preload }
		};
	},
	InteractionHandlerTypes: { Button: 'button', SelectMenu: 'select-menu' },
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

const USER_A = '111111111111111111';
const USER_B = '222222222222222222';

type FakeTrack = { info: { identifier: string; uri: string; title: string; author: string; duration: number }; requester: { id: string } };
type FakePlayer = {
	voiceChannelId: string;
	queue: { tracks: FakeTrack[]; current: null; previous: never[]; splice: (index: number, count: number) => Promise<void> };
};

function makePlayer(count: number): FakePlayer {
	const tracks: FakeTrack[] = Array.from({ length: count }, (_, index) => ({
		info: { identifier: `id-${index}`, uri: `https://music/${index}`, title: `곡 ${index}`, author: 'a', duration: 1000 },
		requester: { id: 'u' }
	}));
	return {
		voiceChannelId: 'voice',
		queue: {
			tracks,
			current: null,
			previous: [],
			splice: async (index, deleteCount) => {
				tracks.splice(index, deleteCount);
			}
		}
	};
}

function render(player: FakePlayer, ownerId: string, page: number, selectedIndex: number | null = null) {
	const totalPages = Math.max(1, Math.ceil(player.queue.tracks.length / 10));
	return queueList({ player: player as never, page, totalPages, authorId: ownerId, selectedIndex }).toJSON();
}

function customIds(rendered: unknown): string[] {
	return [...JSON.stringify(rendered).matchAll(/"custom_id":"([^"]+)"/g)].map((match) => match[1]!);
}

function pageOf(rendered: unknown): number {
	return Number(/페이지 (\d+)\//.exec(JSON.stringify(rendered))![1]);
}

function idFor(rendered: unknown, action: string): string {
	return customIds(rendered).find((id) => id.startsWith(`queue:v1:${action}:`))!;
}

function baseInteraction(userId: string, customId: string) {
	return {
		customId,
		guildId: 'guild',
		user: { id: userId },
		guild: { members: { me: { voice: { channelId: 'voice' } } } },
		member: { permissions: { has: vi.fn(() => false) }, voice: { channel: { id: 'voice' }, channelId: 'voice' } },
		reply: vi.fn().mockResolvedValue(undefined),
		update: vi.fn().mockResolvedValue(undefined),
		deferUpdate: vi.fn().mockResolvedValue(undefined),
		editReply: vi.fn().mockResolvedValue(undefined)
	};
}

const buttons = new QueueViewButtonHandler({} as never, {} as never);
const selects = new ControllerSelectMenuHandler({} as never, {} as never);

async function click(userId: string, customId: string) {
	const interaction = baseInteraction(userId, customId);
	const parsed = buttons.parse(interaction as unknown as ButtonInteraction);
	if (!parsed.isSome()) throw new Error(`not handled: ${customId}`);
	await buttons.run(interaction as unknown as ButtonInteraction<'cached'>, parsed.unwrap());
	return interaction;
}

async function select(userId: string, customId: string, value: string) {
	const interaction = { ...baseInteraction(userId, customId), values: [value], inCachedGuild: () => true };
	const parsed = selects.parse(interaction as unknown as StringSelectMenuInteraction);
	if (!parsed.isSome()) throw new Error(`not handled: ${customId}`);
	await selects.run(interaction as unknown as StringSelectMenuInteraction<'cached'>, parsed.unwrap());
	return interaction;
}

describe('queue view state is per view, not per player', () => {
	let player: FakePlayer;
	beforeEach(() => {
		vi.resetAllMocks();
		player = makePlayer(35);
		mocks.getPlayer.mockReturnValue(player);
		mocks.allowed.mockResolvedValue(true);
		mocks.skip.mockResolvedValue(undefined);
		mocks.preload.mockResolvedValue(undefined);
	});

	it('two users paging the same player do not affect each other', async () => {
		const viewA = render(player, USER_A, 1);
		const viewB = render(player, USER_B, 1);

		// A는 두 번 다음 페이지로 넘긴다.
		const a2 = await click(USER_A, idFor(viewA, 'page').replace(/:\d+$/, ':2'));
		const a2Rendered = a2.update.mock.calls[0]![0].components[0].toJSON();
		expect(pageOf(a2Rendered)).toBe(2);
		const a3 = await click(
			USER_A,
			customIds(a2Rendered)
				.filter((id) => id.startsWith('queue:v1:page:'))
				.at(-1)!
		);
		expect(pageOf(a3.update.mock.calls[0]![0].components[0].toJSON())).toBe(3);

		// B의 화면은 여전히 1쪽이고, B의 '다음'은 A의 쪽수와 무관하게 2쪽이다.
		const bNext = await click(
			USER_B,
			customIds(viewB)
				.filter((id) => id.startsWith('queue:v1:page:'))
				.at(-1)!
		);
		expect(pageOf(bNext.update.mock.calls[0]![0].components[0].toJSON())).toBe(2);
	});

	it('select, remove and jump use the selection carried by the clicked view', async () => {
		const pageA = render(player, USER_A, 3);
		const pageB = render(player, USER_B, 1);
		const tokenA = queueSelectionValue(player as never, 25);
		const tokenB = queueSelectionValue(player as never, 2);

		const selA = await select(USER_A, idFor(pageA, 'sel'), tokenA);
		const renderedA = selA.update.mock.calls[0]![0].components[0].toJSON();
		expect(pageOf(renderedA)).toBe(3);
		const selB = await select(USER_B, idFor(pageB, 'sel'), tokenB);
		const renderedB = selB.update.mock.calls[0]![0].components[0].toJSON();
		expect(pageOf(renderedB)).toBe(1);

		// B가 자기 선택(#3)을 제거한다 — A의 선택이나 쪽수는 영향 없이 B의 1쪽이 갱신된다.
		const removed = await click(USER_B, idFor(renderedB, 'rm'));
		expect(player.queue.tracks.map((track) => track.info.identifier)).not.toContain('id-2');
		expect(player.queue.tracks).toHaveLength(34);
		expect(pageOf(removed.editReply.mock.calls[0]![0].components[0].toJSON())).toBe(1);

		// 대기열이 바뀌었으므로 A의 예전 선택은 엉뚱한 곡을 건드리지 않고 거절된다.
		const staleJump = await click(USER_A, idFor(renderedA, 'jump'));
		expect(mocks.skip).not.toHaveBeenCalled();
		expect(staleJump.reply).toHaveBeenCalledTimes(1);
		expect(player.queue.tracks).toHaveLength(34);

		// A가 다시 선택하면 A의 3쪽 기준으로 동작한다.
		const reselected = await select(USER_A, idFor(render(player, USER_A, 3), 'sel'), queueSelectionValue(player as never, 25));
		const removedA = await click(USER_A, idFor(reselected.update.mock.calls[0]![0].components[0].toJSON(), 'rm'));
		expect(player.queue.tracks.map((track) => track.info.identifier)).not.toContain('id-26');
		expect(pageOf(removedA.editReply.mock.calls[0]![0].components[0].toJSON())).toBe(3);
	});

	it('jump skips to the track chosen in the clicked view', async () => {
		const selected = render(player, USER_A, 2, 14);
		const jump = await click(USER_A, idFor(selected, 'jump'));
		expect(mocks.skip).toHaveBeenCalledWith(player, 15);
		expect(pageOf(jump.editReply.mock.calls[0]![0].components[0].toJSON())).toBe(1);
	});

	it('refuses controls that belong to another user', async () => {
		const viewA = render(player, USER_A, 1, 0);
		for (const action of ['page', 'rm', 'jump']) {
			const interaction = await click(USER_B, idFor(viewA, action));
			expect(interaction.reply).toHaveBeenCalledTimes(1);
			expect(interaction.update).not.toHaveBeenCalled();
		}
		const interaction = await select(USER_B, idFor(viewA, 'sel'), queueSelectionValue(player as never, 0));
		expect(interaction.reply).toHaveBeenCalledTimes(1);
		expect(player.queue.tracks).toHaveLength(35);
		expect(mocks.skip).not.toHaveBeenCalled();
	});

	it('clamps a page past the end after the queue shrank', async () => {
		const stale = queueViewId.encode('page', { ownerId: USER_A, page: 9 });
		const interaction = await click(USER_A, stale);
		expect(pageOf(interaction.update.mock.calls[0]![0].components[0].toJSON())).toBe(4);
	});

	it('shows the empty view when paging an emptied queue', async () => {
		player.queue.tracks.length = 0;
		const interaction = await click(USER_A, queueViewId.encode('page', { ownerId: USER_A, page: 2 }));
		expect(interaction.update).toHaveBeenCalledTimes(1);
	});

	it('asks for a selection when remove or jump is pressed without one', async () => {
		for (const action of ['rm', 'jump'] as const) {
			const interaction = await click(USER_A, queueViewId.encode(action, { ownerId: USER_A, page: 1, token: null }));
			expect(interaction.reply).toHaveBeenCalledTimes(1);
			expect(JSON.stringify(interaction.reply.mock.calls[0]![0])).toContain('먼저 목록에서 곡을 선택');
		}
		expect(player.queue.tracks).toHaveLength(35);
		expect(mocks.skip).not.toHaveBeenCalled();
	});

	it('rejects a selection whose track no longer exists', async () => {
		const token = queueSelectionValue(player as never, 34);
		player.queue.tracks.length = 20;
		const interaction = await click(USER_A, queueViewId.encode('rm', { ownerId: USER_A, page: 4, token }));
		expect(interaction.reply).toHaveBeenCalledTimes(1);
		expect(player.queue.tracks).toHaveLength(20);
	});

	it.each(['queue:page:111111111111111111:2', 'queue:v1:garbage', 'queue:v1:page:abc:2', 'queue:v2:page:111111111111111111:2'])(
		'does not claim legacy or malformed id %s',
		(customId) => {
			expect(buttons.parse(baseInteraction(USER_A, customId) as unknown as ButtonInteraction).isSome()).toBe(false);
		}
	);

	it('claims every button id the view renders and no select id', () => {
		const rendered = render(player, USER_A, 2, 14);
		for (const id of customIds(rendered)) {
			const claimed = buttons.parse(baseInteraction(USER_A, id) as unknown as ButtonInteraction).isSome();
			expect(claimed).toBe(!id.startsWith('queue:v1:sel:') && id !== 'queue:v1:ind');
		}
	});

	it('ignores the disabled page indicator', () => {
		const interaction = baseInteraction(USER_A, 'queue:v1:ind');
		expect(buttons.parse(interaction as unknown as ButtonInteraction).isSome()).toBe(false);
	});
});
