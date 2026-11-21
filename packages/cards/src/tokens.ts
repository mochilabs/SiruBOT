/**
 * satori 카드 공용 디자인 토큰 — 대시보드 다크 테마(apps/dashboard/src/app/globals.css `.dark`, DESIGN.md)를 옮긴 값이에요.
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

/** 정적 폰트 굵기 — 400은 가변 원본, 600/900은 서브셋이에요 (satoriKit.loadCardFonts) */
export const W = { regular: 400, semibold: 600, black: 900 } as const;
