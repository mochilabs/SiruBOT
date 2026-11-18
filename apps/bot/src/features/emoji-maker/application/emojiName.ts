/** 디스코드 서버 이모지 이름 규칙 — 영숫자와 밑줄 2~32자. */
const EMOJI_NAME = /^[A-Za-z0-9_]{2,32}$/;
const FALLBACK_NAME = 'siru_emoji';

/** 사용자가 입력한 이름을 다듬어요. 공백·하이픈은 밑줄로 바꾸고, 그래도 규칙에 안 맞으면 null이에요. */
export function normalizeEmojiName(input: string): string | null {
	const name = input
		.trim()
		.replace(/^:+|:+$/g, '')
		.replace(/[\s-]+/g, '_');
	return EMOJI_NAME.test(name) ? name : null;
}

/** 영어 설명에서 기본 이름을 만들어요 (예: "cat wearing sunglasses" → cat_wearing_sunglasses). */
export function suggestEmojiName(prompt: string): string {
	const name = prompt
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 32)
		.replace(/_+$/, '');
	return name.length >= 2 ? name : FALLBACK_NAME;
}
