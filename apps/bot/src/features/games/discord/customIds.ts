import { defineCustomId, field } from '../../../lib/customId.ts';

/** 게임 버튼 — `views/rps.ts` ↔ `interaction-handlers/games.ts`. pick은 0=가위, 1=바위, 2=보예요. */
export const gameId = defineCustomId({
	namespace: 'game',
	version: 1,
	actions: {
		rps: { pick: field.uint({ maxDigits: 1 }) },
		rpsAgain: {}
	}
});
