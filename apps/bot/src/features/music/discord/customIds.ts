import { defineCustomId, field } from '../../../lib/customId.ts';

export const controllerId = defineCustomId({
	namespace: 'controller',
	version: 1,
	actions: {
		prev: {},
		pause: {},
		resume: {},
		next: {},
		stop: {},
		repeat: { mode: field.oneOf(['off', 'track', 'queue'] as const) },
		chapter: { direction: field.oneOf(['prev', 'next'] as const) },
		volume: { direction: field.oneOf(['up', 'down'] as const) },
		queueView: {}
	}
});

export const panelId = defineCustomId({
	namespace: 'panel',
	version: 1,
	actions: {
		recent: {},
		playlist: {},
		playlistPick: {}
	}
});

export const filterId = defineCustomId({
	namespace: 'filter',
	version: 1,
	actions: { select: {}, reset: {} }
});

export const settingsId = defineCustomId({
	namespace: 'settings',
	version: 1,
	actions: {
		navigate: {},
		selectModules: {},
		back: {},
		toggleController: {},
		toggleRelated: {},
		toggleRepeat: {},
		toggleDeleteInput: {},
		toggleInputPlay: {},
		toggleJtc: {},
		selectSponsorblock: {},
		resetSponsorblock: {},
		selectDj: {},
		removeDj: {},
		selectText: {},
		selectVoice: {},
		selectInputMode: {},
		removeText: {},
		removeVoice: {},
		jtcTemplate: {},
		selectJtcCategory: {},
		selectJtcLimit: {},
		selectTransition: {},
		toggleGapless: {},
		toggleNormalization: {},
		editCrossfade: {},
		editAutomix: {},
		selectAnnounceMode: {},
		selectAiMode: {},
		resetAiHistory: {},
		toggleEmojiEnlarge: {},
		toggleQuote: {},
		toggleEmbedFix: {},
		selectCountingChannel: {},
		disableCounting: {},
		jtcTemplateModal: {},
		jtcTemplateInput: {},
		crossfadeModal: {},
		crossfadeInput: {},
		automixModal: {},
		automixTempoInput: {},
		automixConfidenceInput: {}
	}
});

export const searchId = defineCustomId({
	namespace: 'search',
	version: 1,
	actions: { select: {}, cancel: {} }
});

export const libraryId = defineCustomId({
	namespace: 'library',
	version: 1,
	actions: {
		prev: { sessionId: field.token({ maxLength: 36 }) },
		next: { sessionId: field.token({ maxLength: 36 }) },
		create: { sessionId: field.token({ maxLength: 36 }) },
		add: { sessionId: field.token({ maxLength: 36 }) },
		home: { sessionId: field.token({ maxLength: 36 }) },
		open: { sessionId: field.token({ maxLength: 36 }) },
		remove: { sessionId: field.token({ maxLength: 36 }) },
		delete: { sessionId: field.token({ maxLength: 36 }) },
		cancel: { sessionId: field.token({ maxLength: 36 }) },
		confirm: { sessionId: field.token({ maxLength: 36 }) },
		play: { sessionId: field.token({ maxLength: 36 }) },
		form: { formId: field.token({ maxLength: 36 }) },
		formValue: {}
	}
});

export const playlistAddId = defineCustomId({
	namespace: 'playlist-add',
	version: 1,
	actions: { addRemaining: {}, skipRemaining: {} }
});

export const voteSkipId = defineCustomId({
	namespace: 'skip-vote',
	version: 1,
	actions: { vote: { interactionId: field.snowflake() } }
});
