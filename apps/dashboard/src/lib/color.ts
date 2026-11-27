export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export type Hsv = { h: number; s: number; v: number };

export function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

function channelToHex(value: number): string {
	return Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, "0");
}

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

export function normalizeHex(input: string): string | null {
	const trimmed = input.trim().toLowerCase();
	return HEX_COLOR_PATTERN.test(trimmed) ? trimmed : null;
}
