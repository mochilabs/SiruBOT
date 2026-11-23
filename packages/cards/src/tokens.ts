/**
 * Takumi 카드 공용 디자인 토큰 — 대시보드 다크 테마(apps/dashboard/src/app/globals.css `.dark`, DESIGN.md)를 옮긴 값이에요.
 * 카드는 대시보드의 2배 스케일이라 반경·간격도 2배예요 (rounded-card 1rem → 32, rounded-control 0.625rem → 20).
 * 새 색을 만들지 말고 여기서 골라요. 값을 바꾸려면 대시보드 토큰을 먼저 바꿔요.
 */
export const T = {
	background: '#1f1618',
	surface1: '#2b2023',
	surface2: '#3a2c30',
	foreground: '#fbeeee',
	mutedForeground: '#b9a4a9',
	/** 강조 텍스트(`text-primary-text` = accent-foreground) — 숫자·강조 */
	primaryText: '#ffdada',
	/** 솔리드 강조(`bg-primary-control`) — 막대 피크, CTA 알약 */
	brand: '#f98aa0',
	/** `bg-primary-control` 위의 글자색(`text-primary-control-text`) */
	brandForeground: '#3a1a22',
	/** 인터랙티브 경계(3:1) */
	borderStrong: '#a37d89',
	/** 오류·LIVE 같은 위험 표시(`destructive`) */
	destructive: '#ff7b8a'
} as const;

export const RADIUS = { card: 32, control: 20, controlInner: 12 } as const;

/** 정적 폰트 굵기 — 400은 가변 원본, 600/900은 서브셋이에요 (대시보드 미리보기 폰트) */
export const W = { regular: 400, semibold: 600, black: 900 } as const;

/** '#rrggbb' 색의 색상(hue, 0~360) */
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

/** `T`와 같은 모양의 토큰 — 값만 문자열로 넓혀요. */
export type CardTokens = { [K in keyof typeof T]: string };

/**
 * 서버 테마 색(accent '#rrggbb')에서 다크 카드 토큰을 유도해요 — 배경·표면·글자색이 모두 같은 색상(hue)의 틴트라서
 * accent만 바꿨을 때처럼 어색해지지 않아요. 명도·채도 비율은 기존 분홍 `T`(대시보드 다크 토큰)에 맞췄고,
 * 분홍(기본, accent가 `defaultAccent`)은 `T`를 그대로 돌려줘서 기본 카드는 한 픽셀도 바뀌지 않아요.
 */
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
