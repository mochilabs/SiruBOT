import { defineCustomId, field } from '../../../lib/customId.ts';

/** 기브어웨이 카드의 참여 버튼과 참여 취소 확인 버튼 — `giveaway:v1:enter:{id}` */
export const giveawayId = defineCustomId({
	namespace: 'giveaway',
	version: 1,
	actions: {
		enter: { id: field.token({ maxLength: 36 }) },
		leave: { id: field.token({ maxLength: 36 }) }
	}
});
