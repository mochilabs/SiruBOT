import { defineCustomId, field } from '../../../lib/customId.ts';

/**
 * AI 채팅 기능의 customId 선언 — 뷰는 `encode`, 인터랙션 핸들러는 `decode`로 같은 선언을 써요.
 */

/** AI 채팅 '생성 중지' 버튼 — `views/chatView.ts` ↔ `interaction-handlers/chatCancel.ts`. cancelKey는 중지 컨트롤러를 가리키는 32자 키예요. */
export const chatCancelId = defineCustomId({
	namespace: 'chat-cancel',
	version: 1,
	actions: { stop: { cancelKey: field.token({ maxLength: 32 }) } }
});
