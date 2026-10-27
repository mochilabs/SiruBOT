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
import { DEFAULT_COLOR, emoji } from '@sirubot/utils';
import {
	TICKET_OPEN_CUSTOM_ID,
	TICKET_CLOSE_CUSTOM_ID,
	TICKET_CLAIM_CUSTOM_ID,
	TICKET_CONFIRM_CLOSE_CUSTOM_ID,
	type TicketConfig
} from '@sirubot/utils/ticket';
import type { Ticket } from '@sirubot/prisma';

/**
 * 길드 유저들이 티켓을 열 수 있는 공개 안내 패널 메시지 뷰 (Components V2)
 */
export function ticketPanelView(config: TicketConfig): { flags: number; components: [ContainerBuilder, ActionRowBuilder<ButtonBuilder>] } {
	const container = new ContainerBuilder()
		.setAccentColor(DEFAULT_COLOR)
		.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### 🎫 ${config.panelTitle}`))
		.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
		.addTextDisplayComponents(new TextDisplayBuilder().setContent(config.panelDescription));

	const openButton = new ButtonBuilder().setCustomId(TICKET_OPEN_CUSTOM_ID).setLabel('티켓 생성하기').setEmoji('📩').setStyle(ButtonStyle.Primary);

	const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(openButton);

	return {
		flags: MessageFlags.IsComponentsV2,
		components: [container, actionRow]
	};
}

/**
 * 새로 생성된 티켓 채널의 첫 머리에 표시되는 환영 및 관리 컨트롤러 뷰
 */
export function ticketWelcomeView(ticket: Ticket): { flags: number; components: [ContainerBuilder, ActionRowBuilder<ButtonBuilder>] } {
	const container = new ContainerBuilder().setAccentColor(DEFAULT_COLOR);

	const lines = [
		`### 🎫 티켓 #${String(ticket.ticketNumber).padStart(4, '0')}`,
		`- **신청자**: <@${ticket.ownerId}>`,
		`- **담당자**: ${ticket.claimedById ? `<@${ticket.claimedById}>` : '미배정'}`,
		'',
		'문의하실 내용을 남겨주시면 스태프가 확인 후 답변해 드려요.'
	];

	container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));

	const closeButton = new ButtonBuilder()
		.setCustomId(TICKET_CLOSE_CUSTOM_ID)
		.setLabel('티켓 닫기')
		.setEmoji(emoji('lock'))
		.setStyle(ButtonStyle.Danger);

	const claimButton = new ButtonBuilder()
		.setCustomId(TICKET_CLAIM_CUSTOM_ID)
		.setLabel(ticket.claimedById ? '담당 취소' : '담당하기')
		.setEmoji('🙋')
		.setStyle(ButtonStyle.Secondary);

	const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(closeButton, claimButton);

	return {
		flags: MessageFlags.IsComponentsV2,
		components: [container, actionRow]
	};
}

/**
 * 티켓 닫기 확인 프롬프트 (Ephemeral)
 */
export function ticketCloseConfirmView(): { flags: number; components: [ContainerBuilder, ActionRowBuilder<ButtonBuilder>] } {
	const container = new ContainerBuilder()
		.setAccentColor(DEFAULT_COLOR)
		.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`### ${emoji('lock')} 티켓을 닫으시겠어요?\n닫기를 누르면 유저의 채널 접근이 종료되고 티켓이 마감돼요.`
			)
		);

	const confirmButton = new ButtonBuilder().setCustomId(TICKET_CONFIRM_CLOSE_CUSTOM_ID).setLabel('확인하고 닫기').setStyle(ButtonStyle.Danger);

	const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(confirmButton);

	return {
		flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
		components: [container, actionRow]
	};
}
