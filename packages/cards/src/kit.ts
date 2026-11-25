// Runtime-independent half of the card kit; node-only code (fonts, native raster, downloads) lives in data-api `renderers/shared/takumiKit.tsx`.
// Elements are built with `h()` so this package needs no JSX build setup.

export interface CardElement {
	type: string;
	props: { style?: Record<string, string | number>; children?: CardChild | CardChild[]; [key: string]: unknown };
}
export type CardChild = CardElement | string | number | null | false;

/** Takumi divs default to block, so flex is applied here. */
export function h(type: string, style: Record<string, string | number>, children?: CardChild | CardChild[]): CardElement {
	return { type, props: { style: { display: 'flex', ...style }, children } };
}

/** Pass a data URI or Buffer: a remote URL makes the renderer fetch it itself, bypassing the SSRF boundary. */
export function img(src: string, style: Record<string, string | number>): CardElement {
	return { type: 'img', props: { src, style } };
}

export const CARD_FONT = 'Pretendard';

/** Color emoji are unsupported and would leave blank gaps in titles, so they are stripped; digits, `#` and `*` stay. Runs of spaces left behind collapse to one. */
export function stripEmoji(text: string): string {
	return text
		.replace(/\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|[‍️⃣]/gu, '')
		.replace(/\s{2,}/g, ' ')
		.trim();
}

/** Async LRU keyed by input; concurrent calls share one promise. Null and failures aren't cached. Skips re-downloading for near-identical re-renders (volume, pause, repeat). */
export function createAsyncLru<T>(max: number, load: (key: string) => Promise<T | null>): (key: string) => Promise<T | null> {
	const entries = new Map<string, Promise<T | null>>();
	return (key) => {
		const hit = entries.get(key);
		if (hit) {
			entries.delete(key); // 최근 사용으로 갱신
			entries.set(key, hit);
			return hit;
		}
		const promise = load(key).then(
			(value) => {
				if (value === null && entries.get(key) === promise) entries.delete(key);
				return value;
			},
			(error: unknown) => {
				if (entries.get(key) === promise) entries.delete(key);
				throw error;
			}
		);
		entries.set(key, promise);
		if (entries.size > max) entries.delete(entries.keys().next().value as string);
		return promise;
	};
}
