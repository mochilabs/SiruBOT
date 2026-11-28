// Mirrors the dashboard dark theme (globals.css `.dark`); cards render at 2x so radii and spacing are doubled.
export const T = {
	background: '#1f1618',
	surface1: '#2b2023',
	surface2: '#3a2c30',
	foreground: '#fbeeee',
	mutedForeground: '#b9a4a9',
	primaryText: '#ffdada',
	brand: '#f98aa0',
	brandForeground: '#3a1a22',
	borderStrong: '#a37d89',
	destructive: '#ff7b8a'
} as const;

export const RADIUS = { card: 32, control: 20, controlInner: 12 } as const;

/** 400 is the variable original; 600/900 are subsets. */
export const W = { regular: 400, semibold: 600, black: 900 } as const;

function hueOf(hex: string): number {
	const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
	const max = Math.max(r, g, b);
	const d = max - Math.min(r, g, b);
	if (d === 0) return 0;
	const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
	return Math.round((h * 60 + 360) % 360);
}

function hsl(h: number, s: number, l: number): string {
	const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
	const f = (n: number) => {
		const k = (n + h / 30) % 12;
		const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
		return Math.round(c * 255)
			.toString(16)
			.padStart(2, '0');
	};
	return `#${f(0)}${f(8)}${f(4)}`;
}

export type CardTokens = { [K in keyof typeof T]: string };

export function themedTokens(accentHex: string, defaultAccentHex: string): CardTokens {
	if (accentHex.toLowerCase() === defaultAccentHex.toLowerCase()) return T;
	const h = hueOf(accentHex);
	return {
		background: hsl(h, 20, 10),
		surface1: hsl(h, 18, 15),
		surface2: hsl(h, 16, 20),
		foreground: hsl(h, 60, 96),
		mutedForeground: hsl(h, 14, 68),
		primaryText: hsl(h, 100, 90),
		brand: accentHex,
		brandForeground: hsl(h, 40, 15),
		borderStrong: hsl(h, 14, 55),
		destructive: T.destructive
	};
}
