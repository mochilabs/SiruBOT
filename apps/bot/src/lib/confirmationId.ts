import { defineCustomId, field } from './customId.ts';

export const confirmId = defineCustomId({
	namespace: 'confirm',
	version: 1,
	actions: { yes: { sessionId: field.token({ maxLength: 36 }) }, no: { sessionId: field.token({ maxLength: 36 }) } }
});
