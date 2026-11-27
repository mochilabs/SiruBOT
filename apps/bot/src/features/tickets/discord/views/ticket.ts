import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ContainerBuilder,
	MessageFlags,
	SeparatorBuilder,
	SeparatorSpacingSize,
	TextDisplayBuilder
} from 'discord.js';
import { createContainer, emoji } from '@sirubot/utils';
import type { TicketConfig } from '@sirubot/utils/ticket';
import { ticketId } from '../customIds.ts';
import type { Ticket } from '@sirubot/prisma';

export function ticketPanelView(config: TicketConfig): { flags: number; components: [ContainerBuilder, ActionRowBuilder<ButtonBuilder>] } {
	const container = createContainer()
		.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${emoji('ticket')} ${config.panelTitle}`))
		.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
		.addTextDisplayComponents(new TextDisplayBuilder().setContent(config.panelDescription));

	const openButton = new ButtonBuilder()
		.setCustomId(ticketId.encode('open'))
		.setLabel('티켓 생성하기')
		.setEmoji(emoji('inbox_tray'))
		.setStyle(ButtonStyle.Primary);

	const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(openButton);

	return {
		flags: MessageFlags.IsComponentsV2,
		components: [container, actionRow]
	};
}

export function ticketWelcomeView(ticket: Ticket): { flags: number; components: [ContainerBuilder, ActionRowBuilder<ButtonBuilder>] } {
	const container = createContainer();
	const lines = [
		`<@${ticket.ownerId}> 님의 티켓이 생성되었어요.`,
		'',
		`### ${emoji('ticket')} 티켓 #${String(ticket.ticketNumber).padStart(4, '0')}`,
		`- **신청자**: <@${ticket.ownerId}>`,
		`- **담당자**: ${ticket.claimedById ? `<@${ticket.claimedById}>` : '미배정'}`,
		'',
		'문의하실 내용을 남겨주시면 스태프가 확인 후 답변해 드려요.'
	];
	container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));

	const closeButton = new ButtonBuilder()
		.setCustomId(ticketId.encode('close'))
		.setLabel('티켓 닫기')
		.setEmoji(emoji('lock'))
		.setStyle(ButtonStyle.Danger);

	const claimButton = new ButtonBuilder()
		.setCustomId(ticketId.encode('claim'))
		.setLabel(ticket.claimedById ? '담당 취소' : '담당하기')
		.setEmoji(emoji('user'))
		.setStyle(ButtonStyle.Secondary);

	const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(closeButton, claimButton);

	return {
		flags: MessageFlags.IsComponentsV2,
		components: [container, actionRow]
	};
}

export function ticketMessageView(message: string): { flags: number; components: [ContainerBuilder] } {
	const container = createContainer().addTextDisplayComponents(new TextDisplayBuilder().setContent(message));
	return {
		flags: MessageFlags.IsComponentsV2,
		components: [container]
	};
}
