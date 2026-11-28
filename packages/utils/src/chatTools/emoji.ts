export const EMOJI_ENLARGE_MAX = 10;

const CUSTOM_EMOJI_PATTERN = /^<[a]?:([A-Za-z0-9_~]+):(\d{17,20})>$/u;

export interface EnlargedEmoji {
	id: string;
	name: string;
	animated: boolean;
}

export function parseEmojiOnlyMessage(content: string): EnlargedEmoji[] | null {
	const trimmed = content.trim();
	if (trimmed.length === 0) return null;
	const tokens = trimmed.split(/\s+/u);
	if (tokens.length > EMOJI_ENLARGE_MAX) return null;
	const emojis: EnlargedEmoji[] = [];
	for (const token of tokens) {
		const match = CUSTOM_EMOJI_PATTERN.exec(token);
		if (!match) return null;
		emojis.push({ name: match[1], id: match[2], animated: token.startsWith('<a:') });
	}
	return emojis;
}

export function customEmojiUrl(emoji: EnlargedEmoji, size: 128 | 256 | 512 | 1024 = 512): string {
	return `https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? 'gif' : 'png'}?size=${size}&quality=lossless`;
}
