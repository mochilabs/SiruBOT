/**
 * 이모지 확대 계약 — 커스텀 이모지로만 구성된 메시지를 큰 이미지로 다시 보여줘요.
 *
 * 봇의 general/message 리스너가 이 모듈의 순수 함수로만 메시지를 판정해요 (DB·Discord API 접근 없음).
 * 유니코드 이모지는 CDN 이미지가 없어 확대 대상이 아니에요.
 */

/** 한 메시지에서 확대할 최대 이모지 수 */
export const EMOJI_ENLARGE_MAX = 10;

/** 커스텀 이모지 토큰 — <a?:name:id> 형식만 인정해요 */
const CUSTOM_EMOJI_PATTERN = /^<[a]?:([A-Za-z0-9_~]+):(\d{17,20})>$/u;

export interface EnlargedEmoji {
	id: string;
	name: string;
	animated: boolean;
}

/** 커스텀 이모지만으로 구성된 메시지면 이모지 목록, 아니면 null을 돌려줘요 */
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

/** 커스텀 이모지의 CDN 큰 이미지 주소 */
export function customEmojiUrl(emoji: EnlargedEmoji, size: 128 | 256 | 512 | 1024 = 512): string {
	return `https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? 'gif' : 'png'}?size=${size}&quality=lossless`;
}
