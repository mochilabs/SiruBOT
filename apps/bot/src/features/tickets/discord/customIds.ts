import { defineCustomId } from '../../../lib/customId.ts';

export const ticketId = defineCustomId({
	namespace: 'ticket',
	version: 1,
	actions: { open: {}, close: {}, claim: {} }
});
