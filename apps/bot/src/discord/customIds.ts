import { defineCustomId } from '../lib/customId.ts';

export const evalId = defineCustomId({
	namespace: 'eval',
	version: 1,
	actions: { modal: {}, code: {} }
});

export const helpId = defineCustomId({
	namespace: 'help',
	version: 1,
	actions: { category: {} }
});

export const onboardingId = defineCustomId({
	namespace: 'onboarding',
	version: 1,
	actions: { settings: {}, tour: {} }
});
