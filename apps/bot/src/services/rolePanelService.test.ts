import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, PermissionFlagsBits } from 'discord.js';

const mocks = vi.hoisted(() => ({
	db: {
		rolePanel: { findFirst: vi.fn(), update: vi.fn().mockResolvedValue(undefined), delete: vi.fn() },
		rolePanelButton: { findUnique: vi.fn() }
	},
	logger: { error: vi.fn(), warn: vi.fn() }
}));

vi.mock('@sapphire/framework', () => ({ container: { db: mocks.db, logger: mocks.logger } }));
vi.mock('@sirubot/utils', () => ({ emoji: (name: string) => `:${name}:` }));
vi.mock('../modules/general/view/rolePanel.ts', () => ({ rolePanelView: vi.fn(() => ({ view: true })) }));

import { PanelPostError, RolePanelService } from './rolePanelService.ts';

const GUILD_ID = '100000000000000001';
const BOT_TOP = 10;

function role(id: string, over: Partial<{ position: number; managed: boolean; permissions: bigint }> = {}) {
	const permissions = over.permissions ?? 0n;
	return {
		id,
		name: `role-${id}`,
		position: over.position ?? 1,
		managed: over.managed ?? false,
		permissions: { has: (flag: bigint) => (permissions & flag) === flag }
	};
}

function makeGuild(roles: ReturnType<typeof role>[], channels: Record<string, unknown> = {}) {
	return {
		id: GUILD_ID,
		roles: { everyone: { id: GUILD_ID }, cache: new Map(roles.map((r) => [r.id, r])) },
		channels: { cache: new Map(Object.entries(channels)) },
		members: { me: { permissions: { has: () => false }, roles: { highest: { name: 'bot', position: BOT_TOP } } } }
	} as never;
}

describe('RolePanelService.validateRoles', () => {
	const service = new RolePanelService();

	it('일반 역할은 부여 가능하다', () => {
		expect(service.validateRoles(makeGuild([role('1', { position: 2 })]), ['1'])).toEqual([]);
	});

	it.each([
		['Administrator', PermissionFlagsBits.Administrator],
		['ManageGuild', PermissionFlagsBits.ManageGuild],
		['ManageRoles', PermissionFlagsBits.ManageRoles],
		['BanMembers', PermissionFlagsBits.BanMembers]
	])('%s 권한이 있는 역할은 거부한다', (_name, permissions) => {
		expect(service.validateRoles(makeGuild([role('1', { permissions })]), ['1'])).toEqual(['1']);
	});

	it('@everyone·관리형·봇보다 높은 역할·없는 역할은 거부한다', () => {
		const guild = makeGuild([role('2', { managed: true }), role('3', { position: BOT_TOP })]);
		expect(service.validateRoles(guild, [GUILD_ID, '2', '3', '404'])).toEqual([GUILD_ID, '2', '3', '404']);
	});
});

describe('RolePanelService.getPanel', () => {
	beforeEach(() => vi.clearAllMocks());

	it('panelId와 guildId를 함께 조건으로 조회한다 (다른 길드 패널 차단)', async () => {
		mocks.db.rolePanel.findFirst.mockResolvedValue(null);
		await new RolePanelService().getPanel('panel-1', GUILD_ID);
		expect(mocks.db.rolePanel.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'panel-1', guildId: GUILD_ID } }));
	});
});

describe('RolePanelService.publishPanel', () => {
	beforeEach(() => vi.clearAllMocks());

	function textChannel(id: string, sent = { id: '900000000000000001' }) {
		return {
			id,
			type: ChannelType.GuildText,
			send: vi.fn().mockResolvedValue(sent),
			messages: { delete: vi.fn().mockResolvedValue(undefined), fetch: vi.fn() }
		};
	}

	const panel = (over: Record<string, unknown> = {}) => ({
		id: 'panel-1',
		guildId: GUILD_ID,
		channelId: null,
		messageId: null,
		buttons: [{ id: 'b1', roleId: '1' }],
		...over
	});

	it('다른 길드의 패널이면 PanelPostError로 거부한다', async () => {
		mocks.db.rolePanel.findFirst.mockResolvedValue(null);
		await expect(new RolePanelService().publishPanel(makeGuild([]), 'x', undefined)).rejects.toBeInstanceOf(PanelPostError);
	});

	it('채널이 없으면 패널에 저장된 채널로 폴백한다', async () => {
		const channel = textChannel('200000000000000001');
		mocks.db.rolePanel.findFirst.mockResolvedValue(panel({ channelId: channel.id }));
		const result = await new RolePanelService().publishPanel(makeGuild([], { [channel.id]: channel }), 'panel-1', undefined);
		expect(channel.send).toHaveBeenCalledOnce();
		expect(result).toEqual({ messageId: '900000000000000001', channelId: channel.id });
	});

	it('저장된 채널도 요청 채널도 없으면 안내 오류를 던진다', async () => {
		mocks.db.rolePanel.findFirst.mockResolvedValue(panel());
		await expect(new RolePanelService().publishPanel(makeGuild([]), 'panel-1', undefined)).rejects.toBeInstanceOf(PanelPostError);
	});

	it('텍스트 채널이 아니면 거부한다', async () => {
		const voice = { id: '200000000000000002', type: ChannelType.GuildVoice, send: vi.fn() };
		mocks.db.rolePanel.findFirst.mockResolvedValue(panel());
		await expect(new RolePanelService().publishPanel(makeGuild([], { [voice.id]: voice }), 'panel-1', voice.id)).rejects.toBeInstanceOf(
			PanelPostError
		);
		expect(voice.send).not.toHaveBeenCalled();
	});

	it('재게시하면 DB를 갱신한 뒤 이전 메시지를 삭제한다', async () => {
		const channel = textChannel('200000000000000001');
		mocks.db.rolePanel.findFirst.mockResolvedValue(panel({ channelId: channel.id, messageId: '800000000000000001' }));
		await new RolePanelService().publishPanel(makeGuild([], { [channel.id]: channel }), 'panel-1', channel.id);
		expect(mocks.db.rolePanel.update).toHaveBeenCalledWith({
			where: { id: 'panel-1' },
			data: { channelId: channel.id, messageId: '900000000000000001' }
		});
		expect(channel.messages.delete).toHaveBeenCalledWith('800000000000000001');
	});

	it('refresh는 게시된 메시지를 새로 보내지 않고 edit한다', async () => {
		const channel = textChannel('200000000000000001');
		const existing = { id: '800000000000000001', edit: vi.fn().mockResolvedValue(undefined), reactions: { cache: new Map() } };
		channel.messages.fetch.mockResolvedValue(existing);
		mocks.db.rolePanel.findFirst.mockResolvedValue(panel({ channelId: channel.id, messageId: existing.id }));
		const result = await new RolePanelService().publishPanel(makeGuild([], { [channel.id]: channel }), 'panel-1', undefined, { refresh: true });
		expect(existing.edit).toHaveBeenCalledOnce();
		expect(channel.send).not.toHaveBeenCalled();
		expect(result).toEqual({ messageId: existing.id, channelId: channel.id });
	});

	it('refresh할 게시물이 없으면 null을 돌려준다', async () => {
		mocks.db.rolePanel.findFirst.mockResolvedValue(panel());
		expect(await new RolePanelService().publishPanel(makeGuild([]), 'panel-1', undefined, { refresh: true })).toBeNull();
	});
});

describe('RolePanelService.publishPanel — 반응 모드', () => {
	beforeEach(() => vi.clearAllMocks());

	const reactionPanel = (buttons: Array<{ id: string; roleId: string; emoji: string | null }>, over: Record<string, unknown> = {}) => ({
		id: 'panel-1',
		guildId: GUILD_ID,
		mode: 'reaction',
		channelId: null,
		messageId: null,
		buttons,
		...over
	});

	function channelWith(message: Record<string, unknown>) {
		return {
			id: '200000000000000001',
			type: ChannelType.GuildText,
			send: vi.fn().mockResolvedValue(message),
			messages: { delete: vi.fn().mockResolvedValue(undefined), fetch: vi.fn() }
		};
	}

	it('게시 후 버튼 순서대로 반응을 단다', async () => {
		const message = { id: '900000000000000001', reactions: { cache: new Map() }, react: vi.fn().mockResolvedValue(undefined), delete: vi.fn() };
		const channel = channelWith(message);
		mocks.db.rolePanel.findFirst.mockResolvedValue(
			reactionPanel([
				{ id: 'b1', roleId: '1', emoji: '🎮' },
				{ id: 'b2', roleId: '2', emoji: '🎵' }
			])
		);
		await new RolePanelService().publishPanel(makeGuild([], { [channel.id]: channel }), 'panel-1', channel.id);
		expect(message.react.mock.calls.map((call) => call[0])).toEqual(['🎮', '🎵']);
	});

	it('이모지가 없는 버튼이 있으면 보내기 전에 거부한다', async () => {
		const channel = channelWith({ id: '900000000000000001' });
		mocks.db.rolePanel.findFirst.mockResolvedValue(reactionPanel([{ id: 'b1', roleId: '1', emoji: null }]));
		await expect(new RolePanelService().publishPanel(makeGuild([], { [channel.id]: channel }), 'panel-1', channel.id)).rejects.toBeInstanceOf(
			PanelPostError
		);
		expect(channel.send).not.toHaveBeenCalled();
	});

	it('반응을 달지 못하면 보낸 메시지를 지우고 안내 오류를 던진다', async () => {
		const message = {
			id: '900000000000000001',
			reactions: { cache: new Map() },
			react: vi.fn().mockRejectedValue(new Error('Unknown Emoji')),
			delete: vi.fn().mockResolvedValue(undefined)
		};
		const channel = channelWith(message);
		mocks.db.rolePanel.findFirst.mockResolvedValue(reactionPanel([{ id: 'b1', roleId: '1', emoji: '🎮' }]));
		await expect(new RolePanelService().publishPanel(makeGuild([], { [channel.id]: channel }), 'panel-1', channel.id)).rejects.toBeInstanceOf(
			PanelPostError
		);
		expect(message.delete).toHaveBeenCalledOnce();
		expect(mocks.db.rolePanel.update).not.toHaveBeenCalled();
	});

	it('refresh는 목록에 없는 반응을 지우고 빠진 반응만 단다', async () => {
		const stale = { emoji: { id: null, name: '🔥' }, me: true, remove: vi.fn().mockResolvedValue(undefined) };
		const keep = { emoji: { id: null, name: '🎮' }, me: true, remove: vi.fn() };
		const existing = {
			id: '800000000000000001',
			edit: vi.fn().mockResolvedValue(undefined),
			react: vi.fn().mockResolvedValue(undefined),
			reactions: {
				cache: new Map([
					['a', stale],
					['b', keep]
				])
			}
		};
		const channel = channelWith({});
		channel.messages.fetch.mockResolvedValue(existing);
		mocks.db.rolePanel.findFirst.mockResolvedValue(
			reactionPanel(
				[
					{ id: 'b1', roleId: '1', emoji: '🎮' },
					{ id: 'b2', roleId: '2', emoji: '🎵' }
				],
				{ channelId: channel.id, messageId: existing.id }
			)
		);
		await new RolePanelService().publishPanel(makeGuild([], { [channel.id]: channel }), 'panel-1', undefined, { refresh: true });
		expect(stale.remove).toHaveBeenCalledOnce();
		expect(keep.remove).not.toHaveBeenCalled();
		expect(existing.react.mock.calls.map((call) => call[0])).toEqual(['🎵']);
	});
});

describe('RolePanelService.applyRole', () => {
	beforeEach(() => vi.clearAllMocks());

	function member(has: boolean) {
		return { roles: { cache: { has: () => has }, add: vi.fn().mockResolvedValue(undefined), remove: vi.fn().mockResolvedValue(undefined) } };
	}
	const guild = () => makeGuild([role('1', { position: 2 }), role('9', { permissions: PermissionFlagsBits.Administrator })]);

	it('grant: 없으면 부여, 이미 있으면 아무것도 하지 않는다', async () => {
		const service = new RolePanelService();
		const without = member(false);
		expect(await service.applyRole(guild(), without as never, 'p', '1', 'grant')).toEqual({ ok: true, added: true, changed: true });
		expect(without.roles.add).toHaveBeenCalledWith('1');
		const withRole = member(true);
		expect(await service.applyRole(guild(), withRole as never, 'p', '1', 'grant')).toEqual({ ok: true, added: true, changed: false });
		expect(withRole.roles.add).not.toHaveBeenCalled();
	});

	it('grant: 위험 권한 역할은 거부하고 부여하지 않는다', async () => {
		const target = member(false);
		const result = await new RolePanelService().applyRole(guild(), target as never, 'p', '9', 'grant');
		expect(result.ok).toBe(false);
		expect(target.roles.add).not.toHaveBeenCalled();
	});

	it('revoke: 보유 중일 때만 제거한다 (위험 권한 역할도 해제는 가능)', async () => {
		const service = new RolePanelService();
		const holder = member(true);
		expect(await service.applyRole(guild(), holder as never, 'p', '9', 'revoke')).toEqual({ ok: true, added: false, changed: true });
		expect(holder.roles.remove).toHaveBeenCalledWith('9');
		const none = member(false);
		expect(await service.applyRole(guild(), none as never, 'p', '9', 'revoke')).toEqual({ ok: true, added: false, changed: false });
		expect(none.roles.remove).not.toHaveBeenCalled();
	});
});

describe('RolePanelService.findReactionPanel', () => {
	beforeEach(() => vi.clearAllMocks());

	it('같은 메시지는 캐시해서 DB를 한 번만 조회하고, 다른 길드 요청에는 내주지 않는다', async () => {
		mocks.db.rolePanel.findFirst.mockResolvedValue({ id: 'p', guildId: GUILD_ID, buttons: [] });
		const service = new RolePanelService();
		expect(await service.findReactionPanel(GUILD_ID, 'm1')).not.toBeNull();
		expect(await service.findReactionPanel(GUILD_ID, 'm1')).not.toBeNull();
		expect(await service.findReactionPanel('200000000000000002', 'm1')).toBeNull();
		expect(mocks.db.rolePanel.findFirst).toHaveBeenCalledOnce();
	});
});
