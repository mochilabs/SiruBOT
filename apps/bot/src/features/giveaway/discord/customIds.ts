import { defineCustomId, field } from '../../../lib/customId.ts';

export const giveawayId = defineCustomId({
	namespace: 'giveaway',
	version: 1,
	actions: {
		enter: { id: field.token({ maxLength: 36 }) },
		leave: { id: field.token({ maxLength: 36 }) }
	}
});

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
