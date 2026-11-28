const EMOJI_NAME = /^[A-Za-z0-9_]{2,32}$/;
const FALLBACK_NAME = 'siru_emoji';

export function normalizeEmojiName(input: string): string | null {
	const name = input
		.trim()
		.replace(/^:+|:+$/g, '')
		.replace(/[\s-]+/g, '_');
	return EMOJI_NAME.test(name) ? name : null;
}

export function suggestEmojiName(prompt: string): string {
	const name = prompt
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 32)
		.replace(/_+$/, '');
	return name.length >= 2 ? name : FALLBACK_NAME;
}
