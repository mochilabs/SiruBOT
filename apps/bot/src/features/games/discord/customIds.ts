import { defineCustomId, field } from '../../../lib/customId.ts';

// pick: 0=가위, 1=바위, 2=보
export const gameId = defineCustomId({
	namespace: 'game',
	version: 1,
	actions: {
		rps: { pick: field.uint({ maxDigits: 1 }) },
		rpsAgain: {}
	}
});
