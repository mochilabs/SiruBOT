import { defineCustomId, field } from '../../../lib/customId.ts';

/**
 * 역할 패널 버튼 — `views/rolePanel.ts` ↔ `interaction-handlers/rolePanelButton.ts`
 * buttonId는 DB 버튼 ID(uuid), roleId는 게시 당시 역할 스냅샷이에요. 길이는 `role-panel:v1:grant:` 19 + 36 + 1 + 20 = 76자 이하예요.
 */
export const rolePanelId = defineCustomId({
	namespace: 'role-panel',
	version: 1,
	actions: { grant: { buttonId: field.token({ maxLength: 36 }), roleId: field.snowflake() } }
});
