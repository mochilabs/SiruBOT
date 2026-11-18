import { defineCustomId, field } from '../../../lib/customId.ts';

/**
 * 이모지 생성 결과 메시지와 이름 입력 모달 — `views/emojiMaker.ts` ↔ `emojiMakerSession.ts`.
 * register의 index는 0부터 시작하는 후보 번호예요. nameForm의 formId는 모달마다 새로 만드는 UUID라
 * 같은 사람이 결과 메시지를 여러 개 열어 둬도 모달 제출이 섞이지 않아요.
 */
export const mojiId = defineCustomId({
	namespace: 'moji',
	version: 1,
	actions: {
		register: { index: field.uint({ maxDigits: 1 }) },
		reroll: {},
		nameForm: { formId: field.token({ maxLength: 36 }) },
		nameValue: {}
	}
});
