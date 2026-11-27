import {
	ChannelType,
	PermissionFlagsBits,
	type Guild,
	type GuildMember,
	type Message,
	type MessageCreateOptions,
	type MessageEditOptions,
	type Role,
	type TextChannel
} from 'discord.js';
import { rolePanelEmojiKey, validateReactionButtons } from '@sirubot/utils/rolePanel';
import type { PrismaClient, RolePanel, RolePanelButton } from '@sirubot/prisma';
import type { AppLogger } from '../../../lib/appLogger.ts';

export class PanelPostError extends Error {}

export function resolvePanelChannel(guild: Guild, channelId: string | null | undefined): TextChannel | null {
	if (!channelId) return null;
	const channel = guild.channels.cache.get(channelId);
	if (!channel) return null;
	if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) return null;
	return channel as TextChannel;
}

export async function deletePostedMessage(guild: Guild, channelId: string | null | undefined, messageId: string | null | undefined): Promise<void> {
	const channel = resolvePanelChannel(guild, channelId);
	if (!channel || !messageId) return;
	await channel.messages.delete(messageId).catch(() => null);
}

/** 셀프 부여 시 관리자급 권한 상승을 일으키는 위험 권한 */
export const DANGEROUS_ROLE_PERMISSIONS: ReadonlyArray<readonly [bigint, string]> = [
	[PermissionFlagsBits.Administrator, '관리자'],
	[PermissionFlagsBits.ManageGuild, '서버 관리'],
	[PermissionFlagsBits.ManageRoles, '역할 관리'],
	[PermissionFlagsBits.ManageChannels, '채널 관리'],
	[PermissionFlagsBits.ManageWebhooks, '웹후크 관리'],
	[PermissionFlagsBits.ManageMessages, '메시지 관리'],
	[PermissionFlagsBits.ManageNicknames, '별명 관리'],
	[PermissionFlagsBits.KickMembers, '멤버 추방'],
	[PermissionFlagsBits.BanMembers, '멤버 차단'],
	[PermissionFlagsBits.ModerateMembers, '멤버 타임아웃'],
	[PermissionFlagsBits.MentionEveryone, '@everyone 멘션']
];

const REACTION_PANEL_CACHE_TTL_MS = 30_000;
const REACTION_PANEL_CACHE_MAX = 5000;

type PanelWithButtons = NonNullable<Awaited<ReturnType<RolePanelService['getPanel']>>>;

export interface RolePanelMessagePort {
	panel(panel: RolePanel, buttons: RolePanelButton[]): MessageCreateOptions & MessageEditOptions;
}

export interface RolePanelServiceDeps {
	db: PrismaClient;
	logger: AppLogger;
	messages: RolePanelMessagePort;
}

export class RolePanelService {
	private readonly reactionPanelCache = new Map<string, { expiresAt: number; panel: PanelWithButtons | null }>();

	public constructor(private readonly deps: RolePanelServiceDeps) {}

	private get db() {
		return this.deps.db;
	}

	public async findReactionPanel(guildId: string, messageId: string): Promise<PanelWithButtons | null> {
		const now = Date.now();
		const hit = this.reactionPanelCache.get(messageId);
		if (hit && hit.expiresAt > now) return hit.panel?.guildId === guildId ? hit.panel : null;

		const panel = await this.db.rolePanel.findFirst({
			where: { guildId, messageId, mode: 'reaction' },
			include: { buttons: { orderBy: { position: 'asc' } } }
		});
		if (this.reactionPanelCache.size >= REACTION_PANEL_CACHE_MAX) this.reactionPanelCache.clear();
		this.reactionPanelCache.set(messageId, { expiresAt: now + REACTION_PANEL_CACHE_TTL_MS, panel });
		return panel;
	}

	private invalidateReactionPanel(...messageIds: Array<string | null | undefined>): void {
		for (const messageId of messageIds) if (messageId) this.reactionPanelCache.delete(messageId);
	}

	public async getPanels(guildId: string) {
		return this.db.rolePanel.findMany({
			where: { guildId },
			include: { buttons: { orderBy: { position: 'asc' } } },
			orderBy: { createdAt: 'asc' }
		});
	}

	/** 다른 길드 패널 조회·게시·삭제를 막기 위해 guildId 소유를 함께 검사해요. */
	public async getPanel(panelId: string, guildId: string) {
		return this.db.rolePanel.findFirst({
			where: { id: panelId, guildId },
			include: { buttons: { orderBy: { position: 'asc' } } }
		});
	}

	public async getButton(buttonId: string) {
		return this.db.rolePanelButton.findUnique({ where: { id: buttonId }, include: { panel: true } });
	}

	public async publishPanel(
		guild: Guild,
		panelId: string,
		requestedChannelId: string | undefined,
		options: { refresh?: boolean } = {}
	): Promise<{ messageId: string; channelId: string } | null> {
		const panel = await this.getPanel(panelId, guild.id);
		if (!panel) throw new PanelPostError(`역할 패널을 찾을 수 없어요.`);

		if (options.refresh) {
			const posted = resolvePanelChannel(guild, panel.channelId);
			if (!posted || !panel.messageId) return null;
			const existing: Message | null = await posted.messages.fetch(panel.messageId).catch(() => null);
			if (!existing) return null;
			await existing.edit(this.deps.messages.panel(panel, panel.buttons));
			await this.syncReactions(existing, panel.mode === 'reaction' ? panel.buttons : []);
			this.invalidateReactionPanel(existing.id);
			return { messageId: existing.id, channelId: posted.id };
		}

		if (panel.buttons.length === 0) {
			throw new PanelPostError(`역할 버튼이 하나도 없어요. 버튼을 추가하고 저장한 뒤 게시해 주세요.`);
		}
		if (panel.mode === 'reaction') {
			const reason = validateReactionButtons(panel.buttons);
			if (reason) throw new PanelPostError(reason);
		}
		const channel = resolvePanelChannel(guild, requestedChannelId ?? panel.channelId);
		if (!channel) {
			throw new PanelPostError(`게시할 텍스트 채널을 찾을 수 없어요. 채널을 선택해 주세요.`);
		}

		const message = await channel.send(this.deps.messages.panel(panel, panel.buttons));
		if (panel.mode === 'reaction') {
			try {
				await this.syncReactions(message, panel.buttons);
			} catch (error) {
				await message.delete().catch(() => null);
				throw new PanelPostError(
					`반응을 달지 못했어요. 봇이 해당 이모지를 쓸 수 있는지(다른 서버 이모지 등)와 '반응 추가' 권한을 확인해 주세요.`,
					{ cause: error }
				);
			}
		}
		try {
			await this.db.rolePanel.update({ where: { id: panel.id }, data: { channelId: channel.id, messageId: message.id } });
		} catch (error) {
			// DB 기록에 실패하면 추적 불가한 고아 메시지가 남으니 지우고 실패시켜요.
			await message.delete().catch(() => null);
			throw error;
		}
		this.invalidateReactionPanel(panel.messageId, message.id);
		if (panel.messageId && panel.messageId !== message.id) {
			await deletePostedMessage(guild, panel.channelId, panel.messageId);
		}
		return { messageId: message.id, channelId: channel.id };
	}

	/** 목록 순서대로 달아 패널 반응 순서를 버튼 순서와 맞춥니다. */
	private async syncReactions(message: Message, buttons: ReadonlyArray<{ emoji: string | null }>): Promise<void> {
		const wanted = buttons.filter((button): button is { emoji: string } => !!button.emoji);
		const wantedKeys = new Set(wanted.map((button) => rolePanelEmojiKey(button.emoji)));

		for (const reaction of message.reactions.cache.values()) {
			const key = rolePanelEmojiKey(reaction.emoji.id ? `<:x_x:${reaction.emoji.id}>` : (reaction.emoji.name ?? ''));
			if (!wantedKeys.has(key)) await reaction.remove().catch(() => null);
		}

		const have = new Set(
			[...message.reactions.cache.values()]
				.filter((reaction) => reaction.me)
				.map((reaction) => rolePanelEmojiKey(reaction.emoji.id ? `<:x_x:${reaction.emoji.id}>` : (reaction.emoji.name ?? '')))
		);
		for (const button of wanted) {
			if (!have.has(rolePanelEmojiKey(button.emoji))) await message.react(button.emoji);
		}
	}

	/** 패널을 삭제하고 게시된 메시지도 지워요. 이 길드 소유가 아니면 false. */
	public async deletePanel(guild: Guild, panelId: string): Promise<RolePanel | null> {
		const panel = await this.getPanel(panelId, guild.id);
		if (!panel) return null;
		await this.db.rolePanel.delete({ where: { id: panel.id } });
		this.invalidateReactionPanel(panel.messageId);
		await deletePostedMessage(guild, panel.channelId, panel.messageId);
		return panel;
	}

	/**
	 * 봇이 부여할 수 없는 역할인지 판별해요.
	 * - @everyone / 관리형(봇 소유·통합) 역할은 부여 불가.
	 * - 관리자급 위험 권한(DANGEROUS_ROLE_PERMISSIONS)을 가진 역할은 부여 불가 (권한 상승 방지).
	 * - 봇이 ADMINISTRATOR면 위계 무시, 아니면 봇 최상위 역할 position이 대상보다 높아야 해요.
	 */
	private isRoleAssignable(guild: Guild, role: Role | undefined): { ok: true } | { ok: false; reason: string } {
		if (!role) {
			return { ok: false, reason: '역할을 찾을 수 없어요. 역할이 삭제되었는지 확인해 주세요.' };
		}
		if (role.id === guild.roles.everyone.id) {
			return { ok: false, reason: `@everyone 역할은 부여할 수 없어요.` };
		}
		if (role.managed) {
			return { ok: false, reason: `봇·통합이 관리하는 역할(${role.name})은 부여할 수 없어요.` };
		}

		const dangerous = DANGEROUS_ROLE_PERMISSIONS.find(([flag]) => role.permissions.has(flag));
		if (dangerous) {
			return {
				ok: false,
				reason: `${role.name} 역할은 '${dangerous[1]}' 같은 위험 권한이 있어 패널로 부여할 수 없어요.`
			};
		}

		const me = guild.members.me;
		if (!me) return { ok: false, reason: `봇의 멤버 정보를 읽지 못했어요.` };
		// ADMINISTRATOR면 위계 무시. 아니면 봇 최상위 역할이 대상보다 높아야 해요.
		if (!me.permissions.has(PermissionFlagsBits.Administrator)) {
			const botTop = me.roles.highest;
			if (botTop.position <= role.position) {
				return {
					ok: false,
					reason: `봇 역할(${botTop.name})이 ${role.name} 역할보다 낮아 부여할 수 없어요. 봇 역할을 더 높게 옮겨 주세요.`
				};
			}
		}

		return { ok: true };
	}

	/**
	 * 역할 부여 가능 여부 검증 — 대시보드가 저장 전에 roleIds를 보내 부여 가능한 역할인지 확인해요.
	 * 부여 불가능한 roleId 목록을 돌려줘요 (비어 있으면 전부 가능).
	 */
	public validateRoles(guild: Guild, roleIds: string[]): string[] {
		const invalid: string[] = [];
		for (const roleId of roleIds) {
			const role = guild.roles.cache.get(roleId);
			if (!this.isRoleAssignable(guild, role).ok) invalid.push(roleId);
		}
		return invalid;
	}

	/**
	 * 역할 변경 — 버튼은 'toggle'(보유 중이면 제거·아니면 부여), 반응은 추가='grant'·제거='revoke'예요.
	 * - grant: 부여 가능한 역할인지 검증하고, 이미 보유 중이면 아무것도 하지 않아요(added: false, changed: false).
	 * - revoke: 보유 중일 때만 제거해요. 제거는 권한 상승이 아니라 부여 가능 검증 없이 시도해요.
	 * 성공하면 패널 clickCount를 +1 하고(변경이 있었을 때만), 실패 시 한국어 사유를 돌려줘요.
	 */
	public async applyRole(
		guild: Guild,
		member: GuildMember,
		panelId: string,
		roleId: string,
		action: 'toggle' | 'grant' | 'revoke'
	): Promise<{ ok: true; added: boolean; changed: boolean } | { ok: false; reason: string }> {
		const has = member.roles.cache.has(roleId);
		const wantAdd = action === 'toggle' ? !has : action === 'grant';

		if (wantAdd) {
			const assignable = this.isRoleAssignable(guild, guild.roles.cache.get(roleId));
			if (!assignable.ok) return assignable;
			if (has) return { ok: true, added: true, changed: false };
		} else if (!has) {
			return { ok: true, added: false, changed: false };
		}

		try {
			if (wantAdd) {
				await member.roles.add(roleId);
			} else {
				await member.roles.remove(roleId);
			}
		} catch (error) {
			this.deps.logger.error(
				`[rolePanel] ${action} role failed (guild ${guild.id}, role ${roleId}): ${error instanceof Error ? error.message : String(error)}`
			);
			return { ok: false, reason: `역할을 변경하지 못했어요. 봇 권한을 확인해 주세요.` };
		}

		// 실제로 바뀐 경우만 카운트해요 (부여·제거 무관).
		await this.db.rolePanel
			.update({ where: { id: panelId }, data: { clickCount: { increment: 1 } } })
			.catch((error) =>
				this.deps.logger.warn(
					`[rolePanel] clickCount increment failed (panel ${panelId}): ${error instanceof Error ? error.message : String(error)}`
				)
			);

		return { ok: true, added: wantAdd, changed: true };
	}

	/** 버튼 클릭용 토글 — applyRole('toggle')의 얇은 래퍼예요. */
	public async toggleRole(
		guild: Guild,
		member: GuildMember,
		panelId: string,
		roleId: string
	): Promise<{ ok: true; added: boolean } | { ok: false; reason: string }> {
		return this.applyRole(guild, member, panelId, roleId, 'toggle');
	}
}

export function createRolePanelService(deps: RolePanelServiceDeps): RolePanelService {
	return new RolePanelService(deps);
}

export type { RolePanel };
