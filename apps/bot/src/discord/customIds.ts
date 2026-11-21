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

/** `/도움말` 카테고리 셀렉트 — `views/help.ts` ↔ `help/helpSession.ts`(컬렉터) */
export const helpId = defineCustomId({
	namespace: 'help',
	version: 1,
	actions: { category: {} }
});

/** 서버 가입 안내 버튼 — `views/welcome.ts` ↔ `interaction-handlers/onboardingButton.ts`. 메시지가 남아 있어서 영구 핸들러로 받아요. */
export const onboardingId = defineCustomId({
	namespace: 'onboarding',
	version: 1,
	actions: { settings: {}, tour: {} }
});
