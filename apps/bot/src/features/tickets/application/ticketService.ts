import { ChannelType, Guild, GuildMember, OverwriteType, PermissionFlagsBits, TextChannel, type MessageCreateOptions } from 'discord.js';
import { emoji } from '@sirubot/utils';
import { formatTicketChannelName } from '@sirubot/utils/ticket';
import type { PrismaClient, Ticket } from '@sirubot/prisma';
import { saveTicketTranscript, type UploadObject } from './ticketTranscript.ts';
import type { Stoppable } from '../../../lib/lifecycle.ts';
import type { AppLogger } from '../../../lib/appLogger.ts';

const CHANNEL_DELETE_DELAY_MS = 5000;

export interface TicketMessagePort {
	welcome(ticket: Ticket): MessageCreateOptions;
	notice(message: string): MessageCreateOptions;
}

export interface TicketServiceDeps {
	db: PrismaClient;
	logger: AppLogger;
	messages: TicketMessagePort;
	uploadObject: UploadObject;
}

export class TicketService implements Stoppable {
	public readonly name = '티켓 채널 정리 예약';
	private readonly pendingChannelDeletes = new Map<string, { timer: ReturnType<typeof setTimeout>; run: () => Promise<void> }>();
	private stopped = false;

	public constructor(private readonly deps: TicketServiceDeps) {}

	private get db() {
		return this.deps.db;
	}

	/** DB는 이미 마감 상태라 종료 시 stop()이 남은 삭제를 즉시 실행해 고아 채널을 막아요. */
	public scheduleChannelDelete(channelId: string, run: () => Promise<void>): void {
		if (this.stopped) {
			void run();
			return;
		}
		const timer = setTimeout(() => {
			this.pendingChannelDeletes.delete(channelId);
			void run();
		}, CHANNEL_DELETE_DELAY_MS);
		this.pendingChannelDeletes.set(channelId, { timer, run });
	}

	public async stop(): Promise<void> {
		this.stopped = true;
		const pending = [...this.pendingChannelDeletes.values()];
		this.pendingChannelDeletes.clear();
		for (const entry of pending) clearTimeout(entry.timer);
		await Promise.all(pending.map((entry) => entry.run()));
	}

	public async getConfig(guildId: string) {
		return this.db.ticketConfig.findUnique({
			where: { guildId }
		});
	}

	public async isStaff(member: GuildMember, config: { supportRoleIds: string[] } | null): Promise<boolean> {
		if (member.permissions.has(PermissionFlagsBits.Administrator) || member.permissions.has(PermissionFlagsBits.ManageChannels)) {
			return true;
		}
		if (!config || config.supportRoleIds.length === 0) return false;
		return config.supportRoleIds.some((roleId) => member.roles.cache.has(roleId));
	}

	public async createTicket(
		guild: Guild,
		member: GuildMember
	): Promise<{ ok: true; ticket: Ticket; channel: TextChannel } | { ok: false; reason: string }> {
		const config = await this.getConfig(guild.id);
		if (!config || !config.enabled) {
			return { ok: false, reason: '이 서버에서는 티켓 기능이 비활성화되어 있어요.' };
		}

		const openCount = await this.db.ticket.count({
			where: {
				guildId: guild.id,
				ownerId: member.id,
				status: 'open'
			}
		});

		if (openCount >= config.maxOpenPerUser) {
			return {
				ok: false,
				reason: `동시에 열 수 있는 티켓 수(${config.maxOpenPerUser}개)에 도달했어요. 기존 티켓을 먼저 종료해 주세요.`
			};
		}

		const permissionOverwrites = [
			{
				id: guild.roles.everyone.id,
				type: OverwriteType.Role,
				deny: [PermissionFlagsBits.ViewChannel]
			},
			{
				id: guild.client.user.id,
				type: OverwriteType.Member,
				allow: [
					PermissionFlagsBits.ViewChannel,
					PermissionFlagsBits.SendMessages,
					PermissionFlagsBits.ManageChannels,
					PermissionFlagsBits.EmbedLinks,
					PermissionFlagsBits.AttachFiles,
					PermissionFlagsBits.ReadMessageHistory
				]
			},
			{
				id: member.id,
				type: OverwriteType.Member,
				allow: [
					PermissionFlagsBits.ViewChannel,
					PermissionFlagsBits.SendMessages,
					PermissionFlagsBits.AttachFiles,
					PermissionFlagsBits.ReadMessageHistory
				]
			}
		];

		for (const roleId of config.supportRoleIds) {
			if (guild.roles.cache.has(roleId)) {
				permissionOverwrites.push({
					id: roleId,
					type: OverwriteType.Role,
					allow: [
						PermissionFlagsBits.ViewChannel,
						PermissionFlagsBits.SendMessages,
						PermissionFlagsBits.AttachFiles,
						PermissionFlagsBits.ReadMessageHistory
					]
				});
			}
		}

		// 티켓 번호 트랜잭션 증가
		const updatedConfig = await this.db.ticketConfig.update({
			where: { guildId: guild.id },
			data: { ticketCounter: { increment: 1 } }
		});

		const ticketNumber = updatedConfig.ticketCounter;
		const channelName = formatTicketChannelName(ticketNumber);

		// 디스코드 채널 생성 (카테고리 지정 여부 반영)
		let channel: TextChannel;
		try {
			channel = (await guild.channels.create({
				name: channelName,
				type: ChannelType.GuildText,
				parent: config.categoryId ?? undefined,
				permissionOverwrites
			})) as TextChannel;
		} catch (error) {
			this.deps.logger.error(`[ticket] Failed to create channel for guild ${guild.id}: ${error}`);
			return { ok: false, reason: '채널을 생성하지 못했어요. 봇의 권한(Manage Channels)을 확인해 주세요.' };
		}

		// DB 레코드 생성
		const ticket = await this.db.ticket.create({
			data: {
				guildId: guild.id,
				channelId: channel.id,
				ticketNumber,
				ownerId: member.id,
				status: 'open'
			}
		});

		// 채널 첫 메시지 전송
		const welcomePayload = this.deps.messages.welcome(ticket);
		await channel.send(welcomePayload).catch((err) => this.deps.logger.warn(`[ticket] Failed to send welcome in channel ${channel.id}: ${err}`));

		return { ok: true, ticket, channel };
	}

	/**
	 * 티켓 종료
	 */
	public async closeTicket(
		guild: Guild,
		channelId: string,
		closedByMember: GuildMember,
		reason?: string
	): Promise<{ ok: true; ticket: Ticket } | { ok: false; reason: string }> {
		const ticket = await this.db.ticket.findUnique({
			where: { channelId }
		});

		if (!ticket || ticket.status !== 'open') {
			return { ok: false, reason: '진행 중인 티켓 채널이 아니에요.' };
		}

		const config = await this.getConfig(guild.id);
		const isStaff = await this.isStaff(closedByMember, config);
		const isOwner = ticket.ownerId === closedByMember.id;

		// 유저 본인 또는 스태프만 닫을 수 있음
		if (!isOwner && !isStaff) {
			return { ok: false, reason: '티켓 신청자 또는 담당자만 티켓을 닫을 수 있어요.' };
		}

		const updatedTicket = await this.db.ticket.update({
			where: { id: ticket.id },
			data: {
				status: 'closed',
				closedById: closedByMember.id,
				closeReason: reason ?? '사용자/스태프 요청으로 종료',
				closedAt: new Date()
			}
		});

		// 채널이 사라지기 전에 대화 기록을 비공개 버킷에 남겨요 — 실패해도 마감은 계속돼요
		const ticketChannel = guild.channels.cache.get(updatedTicket.channelId);
		const transcriptChannel = ticketChannel?.isTextBased() ? ticketChannel : null;
		const transcriptKey = await saveTicketTranscript(
			this.deps,
			transcriptChannel,
			updatedTicket,
			closedByMember.id,
			updatedTicket.closeReason
		).catch(() => null);
		const ticketWithTranscript = transcriptKey
			? await this.db.ticket.update({ where: { id: ticket.id }, data: { transcriptKey, transcribedAt: new Date() } })
			: updatedTicket;

		// 채널 삭제 (스케줄링 또는 즉시 삭제)
		const channel = guild.channels.cache.get(channelId);
		if (channel && channel.isTextBased()) {
			await channel.send(this.deps.messages.notice(`${emoji('lock')} 티켓이 마감되었어요. 곧 채널이 삭제돼요.`)).catch(() => null);
			this.scheduleChannelDelete(channelId, () =>
				channel.delete('티켓 마감 및 채널 정리').then(
					() => undefined,
					(err) => {
						this.deps.logger.warn(`[ticket] Failed to delete channel ${channelId}: ${err}`);
					}
				)
			);
		}

		// 로그 채널 알림 (설정되어 있다면)
		if (config?.logChannelId) {
			const logChannel = guild.channels.cache.get(config.logChannelId);
			if (logChannel && logChannel.isTextBased() && 'send' in logChannel) {
				await (logChannel as TextChannel)
					.send({
						...this.deps.messages.notice(
							[
								`### ${emoji('clipboard')} 티켓 마감 #${String(ticket.ticketNumber).padStart(4, '0')}`,
								`- **신청자**: <@${ticket.ownerId}>`,
								`- **종료자**: <@${closedByMember.id}>`,
								`- **사유**: ${updatedTicket.closeReason}`
							].join('\n')
						),
						allowedMentions: { parse: [] }
					})
					.catch(() => null);
			}
		}

		return { ok: true, ticket: ticketWithTranscript };
	}

	/**
	 * 담당자 지정/해제 (Claim)
	 */
	public async toggleClaim(
		guild: Guild,
		channelId: string,
		member: GuildMember
	): Promise<{ ok: true; ticket: Ticket } | { ok: false; reason: string }> {
		const ticket = await this.db.ticket.findUnique({
			where: { channelId }
		});

		if (!ticket || ticket.status !== 'open') {
			return { ok: false, reason: '진행 중인 티켓 채널이 아니에요.' };
		}

		const config = await this.getConfig(guild.id);
		const isStaff = await this.isStaff(member, config);
		if (!isStaff) {
			return { ok: false, reason: '스태프/담당자만 티켓을 담당할 수 있어요.' };
		}

		const isClaimedByMe = ticket.claimedById === member.id;
		const nextClaimedById = isClaimedByMe ? null : member.id;

		const updated = await this.db.ticket.update({
			where: { id: ticket.id },
			data: { claimedById: nextClaimedById }
		});

		const channel = guild.channels.cache.get(channelId);
		if (channel && channel.isTextBased()) {
			const msg = nextClaimedById
				? `${emoji('user')} <@${member.id}> 님이 이 티켓의 담당자로 지정되었어요.`
				: `${emoji('repeat')} <@${member.id}> 님이 티켓 담당을 해제했어요.`;
			await (channel as TextChannel).send({ ...this.deps.messages.notice(msg), allowedMentions: { parse: [] } }).catch(() => null);
		}

		return { ok: true, ticket: updated };
	}

	/**
	 * 티켓에 추가 멤버 초대/제외
	 */
	public async modifyMemberAccess(
		guild: Guild,
		channelId: string,
		targetMemberId: string,
		action: 'add' | 'remove',
		operator: GuildMember
	): Promise<{ ok: true } | { ok: false; reason: string }> {
		const ticket = await this.db.ticket.findUnique({
			where: { channelId }
		});

		if (!ticket || ticket.status !== 'open') {
			return { ok: false, reason: '진행 중인 티켓 채널이 아니에요.' };
		}

		const config = await this.getConfig(guild.id);
		const isStaff = await this.isStaff(operator, config);
		const isOwner = ticket.ownerId === operator.id;

		if (!isOwner && !isStaff) {
			return { ok: false, reason: '티켓 신청자나 스태프만 참여자를 관리할 수 있어요.' };
		}

		const channel = guild.channels.cache.get(channelId) as TextChannel | undefined;
		if (!channel) {
			return { ok: false, reason: '채널을 찾을 수 없어요.' };
		}

		try {
			if (action === 'add') {
				await channel.permissionOverwrites.edit(targetMemberId, {
					ViewChannel: true,
					SendMessages: true,
					AttachFiles: true,
					ReadMessageHistory: true
				});
				await channel.send({
					...this.deps.messages.notice(`${emoji('wave')} <@${targetMemberId}> 님이 티켓에 초대되었어요.`),
					allowedMentions: { parse: [] }
				});
			} else {
				await channel.permissionOverwrites.delete(targetMemberId);
				await channel.send({
					...this.deps.messages.notice(`${emoji('arrow_forward')} <@${targetMemberId}> 님이 티켓에서 제외되었어요.`),
					allowedMentions: { parse: [] }
				});
			}
			return { ok: true };
		} catch (error) {
			this.deps.logger.error(`[ticket] Failed to ${action} member ${targetMemberId} in channel ${channelId}: ${error}`);
			return { ok: false, reason: '채널 권한 수정에 실패했어요.' };
		}
	}
}

export function createTicketService(deps: TicketServiceDeps): TicketService {
	return new TicketService(deps);
}
