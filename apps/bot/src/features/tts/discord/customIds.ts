import { defineCustomId, field } from '../../../lib/customId.ts';

/**
 * TTS 기능의 customId 선언 — 뷰는 `encode`, 인터랙션 핸들러는 `decode`로 같은 선언을 써요.
 */

/**
 * /tts 설정 패널 — `views/ttsView.ts` ↔ `interaction-handlers/ttsPanelButton.ts`(toggle·reset) · `ttsPanelSelect.ts`(lang·voice·channel·emotion)
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
