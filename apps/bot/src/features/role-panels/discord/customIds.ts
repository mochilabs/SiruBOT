import { defineCustomId, field } from '../../../lib/customId.ts';

export const rolePanelId = defineCustomId({
	namespace: 'role-panel',
	version: 1,
	actions: { grant: { buttonId: field.token({ maxLength: 36 }), roleId: field.snowflake() } }
});
