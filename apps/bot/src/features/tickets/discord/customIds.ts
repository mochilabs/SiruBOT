import { defineCustomId } from '../../../lib/customId.ts';

/** 티켓 패널·티켓 채널·닫기 확인 버튼 — `views/ticket.ts` ↔ `interaction-handlers/ticketButton.ts` */
export const ticketId = defineCustomId({
	namespace: 'ticket',
	version: 1,
	actions: { open: {}, close: {}, claim: {}, confirmClose: {}, cancelClose: {} }
});
