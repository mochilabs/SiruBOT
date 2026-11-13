import { defineCustomId } from '../lib/customId.ts';

/**
 * 일반 모듈의 customId 선언 — 뷰는 `encode`, 인터랙션 핸들러는 `decode`로 같은 선언을 써요.
 */

/** 봇 소유자 eval 모달과 코드 입력칸 — `views/eval.ts` ↔ `interaction-handlers/evalModal.ts` */
export const evalId = defineCustomId({
	namespace: 'eval',
	version: 1,
	actions: { modal: {}, code: {} }
});
