import { MessageFlags } from 'discord.js';
import { notice } from '../../../lib/notice.ts';
import type { TicketMessagePort } from '../application/ticketService.ts';
import { ticketWelcomeView } from './views/ticket.ts';

export const ticketMessages: TicketMessagePort = {
	welcome: (ticket) => ticketWelcomeView(ticket),
	notice: (message) => ({ components: [notice(message)], flags: [MessageFlags.IsComponentsV2] })
};
