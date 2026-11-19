import { defineCustomId, field } from '../../../lib/customId.ts';

/**
 * 이모지 생성 결과 메시지와 이름 입력 모달 — `views/emojiMaker.ts` ↔ `emojiMakerSession.ts`.
 * pick은 등록할 후보를 고르는 셀렉트 메뉴이고, 고른 값(0부터 시작하는 후보 번호)은 메뉴 값으로 와요. nameForm의 formId는 모달마다 새로 만드는 UUID라
 * 같은 사람이 결과 메시지를 여러 개 열어 둬도 모달 제출이 섞이지 않아요.
 */
export const mojiId = defineCustomId({
	namespace: 'moji',
	version: 1,
	actions: {
		pick: {},
		reroll: {},
		nameForm: { formId: field.token({ maxLength: 36 }) },
		nameValue: {}
	}
});
