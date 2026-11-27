import { defineCustomId, field } from '../../../lib/customId.ts';

export const ttsId = defineCustomId({
	namespace: 'tts',
	version: 1,
	actions: {
		toggle: { lang: field.token({ maxLength: 8 }) },
		reset: { lang: field.token({ maxLength: 8 }) },
		lang: { lang: field.token({ maxLength: 8 }) },
		voice: { lang: field.token({ maxLength: 8 }) },
		channel: { lang: field.token({ maxLength: 8 }) },
		emotion: { lang: field.token({ maxLength: 8 }) }
	}
});
