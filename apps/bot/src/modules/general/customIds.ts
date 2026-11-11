import { defineCustomId, field } from '../../lib/customId.ts';

/**
 * 일반 모듈의 customId 선언 — 뷰는 `encode`, 인터랙션 핸들러는 `decode`로 같은 선언을 써요.
 */

/**
 * /tts 설정 패널 — `view/ttsView.ts` ↔ `interaction-handlers/ttsPanelButton.ts`(toggle·reset) · `ttsPanelSelect.ts`(lang·voice·channel·emotion)
 * 패널을 다시 그려도 보던 언어가 유지되도록 모든 ID가 언어 코드를 실어 보내요.
 */
export const ttsId = defineCustomId({
	namespace: 'tts',
	version: 1,
	actions: {
		toggle: { lang: field.token({ maxLength: 8 }) },
		reset: { lang: field.token({ maxLength: 8 }) },
		lang: { lang: field.token({ maxLength: 8 }) },
		voice: { lang: field.token({ maxLength: 8 }) },
		channel: { lang: field.token({ maxLength: 8 }) },
		emotion: { lang: field.token({ maxLength: 8 }) }
	}
});

/** AI 채팅 '생성 중지' 버튼 — `view/chatView.ts` ↔ `interaction-handlers/chatCancel.ts`. cancelKey는 중지 컨트롤러를 가리키는 32자 키예요. */
export const chatCancelId = defineCustomId({
	namespace: 'chat-cancel',
	version: 1,
	actions: { stop: { cancelKey: field.token({ maxLength: 32 }) } }
});

/** 봇 소유자 eval 모달과 코드 입력칸 — `view/eval.ts` ↔ `interaction-handlers/evalModal.ts` */
export const evalId = defineCustomId({
	namespace: 'eval',
	version: 1,
	actions: { modal: {}, code: {} }
});
