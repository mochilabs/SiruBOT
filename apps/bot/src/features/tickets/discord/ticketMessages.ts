import { MessageFlags } from 'discord.js';
import { notice } from '../../../lib/notice.ts';
import type { TicketMessagePort } from '../application/ticketService.ts';
import { ticketWelcomeView } from './views/ticket.ts';

/** 티켓 서비스가 채널에 직접 올리는 메시지의 Discord 렌더링 — 뷰 호출과 Components V2 플래그를 여기서 맡아요. */
export const ticketMessages: TicketMessagePort = {
	welcome: (ticket) => ticketWelcomeView(ticket),
	notice: (message) => ({ components: [notice(message)], flags: [MessageFlags.IsComponentsV2] })
};
