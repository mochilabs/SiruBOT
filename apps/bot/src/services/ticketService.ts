import { container } from '@sapphire/framework';
import { ChannelType, Guild, GuildMember, OverwriteType, PermissionFlagsBits, TextChannel } from 'discord.js';
import { formatTicketChannelName } from '@sirubot/utils/ticket';
import type { Ticket } from '@sirubot/prisma';
import { ticketWelcomeView } from '../modules/general/view/ticket.ts';
export class TicketService {
	private get db() {
		return container.db;
	}

	public async getConfig(guildId: string) {
		return this.db.ticketConfig.findUnique({
			where: { guildId }
		});
	}

	/**
	 * 유저가 담당자(스태프) 역할을 가지고 있는지 확인해요.
	 * 서버 관리자(Administrator) 또는 ManageChannels 권한을 가진 유저도 스태프로 인정해요.
	 */
	public async isStaff(member: GuildMember, config: { supportRoleIds: string[] } | null): Promise<boolean> {
		if (member.permissions.has(PermissionFlagsBits.Administrator) || member.permissions.has(PermissionFlagsBits.ManageChannels)) {
			return true;
		}
		if (!config || config.supportRoleIds.length === 0) return false;
		return config.supportRoleIds.some((roleId) => member.roles.cache.has(roleId));
	}

	/**
	 * 신규 티켓 생성
	 */
	public async createTicket(
		guild: Guild,
		member: GuildMember
	): Promise<{ ok: true; ticket: Ticket; channel: TextChannel } | { ok: false; reason: string }> {
		const config = await this.getConfig(guild.id);
		if (!config || !config.enabled) {
			return { ok: false, reason: '이 서버에서는 티켓 기능이 비활성화되어 있어요.' };
		}

		// 유저 동시 오픈 티켓 수 제한 검사
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

		// 채널 생성에 필요한 권한 오버라이트 구성
		// 1. @everyone: ViewChannel Deny
		// 2. 봇 본인: ViewChannel, SendMessages, ManageChannels, EmbedLinks, AttachFiles Allow
		// 3. 신청 유저: ViewChannel, SendMessages, AttachFiles, ReadMessageHistory Allow
		// 4. 담당자 역할군: ViewChannel, SendMessages, AttachFiles, ReadMessageHistory Allow
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
			container.logger.error(`[ticket] Failed to create channel for guild ${guild.id}: ${error}`);
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
		const welcomePayload = ticketWelcomeView(ticket);
		await channel
			.send({
				content: `<@${member.id}> 님의 티켓이 생성되었어요.`,
				...welcomePayload
			})
			.catch((err) => container.logger.warn(`[ticket] Failed to send welcome in channel ${channel.id}: ${err}`));

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

		// 채널 삭제 (스케줄링 또는 즉시 삭제)
		const channel = guild.channels.cache.get(channelId);
		if (channel && channel.isTextBased()) {
			await channel.send('🔒 티켓이 마감되었어요. 5초 뒤 채널이 정리돼요.').catch(() => null);
			setTimeout(() => {
				channel.delete('티켓 마감 및 채널 정리').catch((err) => {
					container.logger.warn(`[ticket] Failed to delete channel ${channelId}: ${err}`);
				});
			}, 5000);
		}

		// 로그 채널 알림 (설정되어 있다면)
		if (config?.logChannelId) {
			const logChannel = guild.channels.cache.get(config.logChannelId);
			if (logChannel && logChannel.isTextBased() && 'send' in logChannel) {
				await (logChannel as TextChannel)
					.send({
						content: `📋 **[티켓 마감 #${String(ticket.ticketNumber).padStart(4, '0')}]**\n- 신청자: <@${ticket.ownerId}>\n- 종료자: <@${closedByMember.id}>\n- 사유: ${updatedTicket.closeReason}`
					})
					.catch(() => null);
			}
		}

		return { ok: true, ticket: updatedTicket };
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
				? `🙋 <@${member.id}> 님이 이 티켓의 담당자로 지정되었어요.`
				: `🔄 <@${member.id}> 님이 티켓 담당을 해제했어요.`;
			await (channel as TextChannel).send(msg).catch(() => null);
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
				await channel.send(`👋 <@${targetMemberId}> 님이 티켓에 초대되었어요.`);
			} else {
				await channel.permissionOverwrites.delete(targetMemberId);
				await channel.send(`🚪 <@${targetMemberId}> 님이 티켓에서 제외되었어요.`);
			}
			return { ok: true };
		} catch (error) {
			container.logger.error(`[ticket] Failed to ${action} member ${targetMemberId} in channel ${channelId}: ${error}`);
			return { ok: false, reason: '채널 권한 수정에 실패했어요.' };
		}
	}
}
