import { defineCustomId, field } from '../../../lib/customId.ts';

export const chatCancelId = defineCustomId({
	namespace: 'chat-cancel',
	version: 1,
	actions: { stop: { cancelKey: field.token({ maxLength: 32 }) } }
});
