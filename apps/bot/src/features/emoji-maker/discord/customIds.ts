import { defineCustomId, field } from '../../../lib/customId.ts';

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
