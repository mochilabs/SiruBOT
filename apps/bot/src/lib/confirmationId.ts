import { defineCustomId, field } from './customId.ts';

/**
 * 확인/취소 버튼 — `modules/general/view/confirmation.ts`가 만들고 `lib/confirmation.ts`의 컬렉터가 해석해요.
 * sessionId는 확인 창을 띄울 때마다 새로 만드는 UUID예요.
 */
export const confirmId = defineCustomId({
	namespace: 'confirm',
	version: 1,
	actions: { yes: { sessionId: field.token({ maxLength: 36 }) }, no: { sessionId: field.token({ maxLength: 36 }) } }
});
