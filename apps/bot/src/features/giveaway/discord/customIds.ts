import { defineCustomId, field } from '../../../lib/customId.ts';

/** 나눔 카드의 참여 버튼과 참여 취소 확인 버튼 — `giveaway:v1:enter:{id}` */
export const giveawayId = defineCustomId({
	namespace: 'giveaway',
	version: 1,
	actions: {
		enter: { id: field.token({ maxLength: 36 }) },
		leave: { id: field.token({ maxLength: 36 }) }
	}
});

/**
 * `/나눔 시작` 설정 패널의 컴포넌트와 모달 — `views/giveawaySetupView.ts` ↔ `giveawaySetupSession.ts`.
 * 패널은 한 메시지에 한 세션(컬렉터)이라 컴포넌트 ID에는 값이 필요 없어요. form의 formId는 모달마다 새로 만드는 UUID예요.
 */
export const giveawaySetupId = defineCustomId({
	namespace: 'giveaway-setup',
	version: 1,
	actions: {
		prize: {},
		end: {},
		days: {},
		match: {},
		quick: {},
		channel: {},
		required: {},
		blocked: {},
		start: {},
		cancel: {},
		form: { formId: field.token({ maxLength: 36 }) },
		prizeInput: {},
		winnersInput: {},
		endInput: {},
		joinDaysInput: {},
		accountDaysInput: {}
	}
});
