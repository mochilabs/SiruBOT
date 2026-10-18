/** #RRGGBB 형식 — packages/utils 스키마와 같은 규칙이에요 */
export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/** HSV — h는 0~360(도), s·v는 0~1 */
export type Hsv = { h: number; s: number; v: number };

export function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

/** 0~255 정수 → 두 자리 HEX */
function channelToHex(value: number): string {
	return Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, "0");
}

/** '#RRGGBB' → HSV. 형식이 맞지 않으면 흰색으로 떨어뜨려요 — 편집 중인 입력값이 화면을 깨지 않게요 */
export function hexToHsv(hex: string): Hsv {
	if (!HEX_COLOR_PATTERN.test(hex)) return { h: 0, s: 0, v: 1 };
	const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
	const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
	const b = Number.parseInt(hex.slice(5, 7), 16) / 255;

	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const delta = max - min;

	let h = 0;
	if (delta !== 0) {
		if (max === r) h = ((g - b) / delta) % 6;
		else if (max === g) h = (b - r) / delta + 2;
		else h = (r - g) / delta + 4;
		h *= 60;
		if (h < 0) h += 360;
	}

	return { h, s: max === 0 ? 0 : delta / max, v: max };
}

/** HSV → '#RRGGBB'. 같은 색은 항상 같은 문자열이 나와요(반올림 일관성) */
export function hsvToHex(h: number, s: number, v: number): string {
	const hue = ((h % 360) + 360) % 360;
	const saturation = clamp01(s);
	const value = clamp01(v);

	const c = value * saturation;
	const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
	const m = value - c;
	const sector = Math.floor(hue / 60) % 6;

	const [r, g, b] =
		sector === 0
			? [c, x, 0]
			: sector === 1
				? [x, c, 0]
				: sector === 2
					? [0, c, x]
					: sector === 3
						? [0, x, c]
						: sector === 4
							? [x, 0, c]
							: [c, 0, x];

	return `#${channelToHex((r + m) * 255)}${channelToHex((g + m) * 255)}${channelToHex((b + m) * 255)}`;
}

/** 대문자·공백 섞인 입력을 '#rrggbb' 소문자로 정리해요. 형식이 맞지 않으면 null */
export function normalizeHex(input: string): string | null {
	const trimmed = input.trim().toLowerCase();
	return HEX_COLOR_PATTERN.test(trimmed) ? trimmed : null;
}
