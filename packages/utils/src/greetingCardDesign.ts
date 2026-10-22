/**
 * 인사 카드 배경 디자인 공용 계약 — data-api skia 렌더러와 dashboard 브라우저 미리보기가
 * 같은 브랜드 프리셋 hex·그라데이션 파라미터를 써요. 브랜드 색이 갈라지면 시각적 계약이
 * 깨지므로 프리셋 hex 12값과 스크림 색의 단일 출처예요. canvas 호출은 각 런타임이 유지하고
 * 이 모듈은 데이터·순수 함수만 담아요. dashboard는 서브패스(@sirubot/utils/greetingCardDesign)로만 import해요.
 */

/** 프리셋 그라데이션 — 카드 바닥 단색 + 좌하→우상 대각 그라디언트(from/to) + 코너 글로우 색 (전부 #RRGGBB) */
export interface GreetingPresetGradient {
	/** 카드 바닥 단색 — 그라디언트 아래에 까는 색 */
	base: string;
	/** 대각 그라디언트 시작색(좌하단) */
	from: string;
	/** 대각 그라디언트 끝색(우상단) */
	to: string;
	/** 코너 글로우 색 — 알파 0.2→0으로 우상단에 퍼져요 */
	glow: string;
}

/**
 * 브랜드 프리셋 hex 12값 — DESIGN.md 브랜드 팔레트(로즈 핑크/플럼 다크/골드 secondary)의 그라디언트라서
 * 프리셋 자체가 브랜드 정체성이에요. 사진 배경이 아니라 브랜드 그라디언트를 제공하는 이유. 값 변경은 시각적 계약 변경이에요.
 */
export const GREETING_PRESET_GRADIENTS: Record<string, GreetingPresetGradient> = {
	rose: { base: '#3d2328', from: '#d1608a', to: '#ff85c1', glow: '#ffe4f0' },
	plum: { base: '#1a0e12', from: '#231317', to: '#4d2a35', glow: '#ffb3d9' },
	gold: { base: '#231a10', from: '#8a6a44', to: '#d4a574', glow: '#f0e2cf' }
};

/** 그라디언트 위에서 흰 텍스트가 읽히도록 프리셋 배경에 까는 은은한 어두운 스크림 */
export const GREETING_PRESET_SCRIM = 'rgba(26,14,18,0.32)';

/** 미지정·알 수 없는 프리셋 id 폴백 */
const DEFAULT_PRESET_ID = 'plum';

/** 코너 글로우 기하 — 카드 크기 대비 중심(0.78, 0.22), 반지름은 카드 폭의 0.55, 알파 0.2→0 */
const GLOW_GEOMETRY = { centerX: 0.78, centerY: 0.22, radiusFactor: 0.55, innerAlpha: 0.2, outerAlpha: 0 } as const;

/** #RRGGBB + 알파 → canvas rgba(r,g,b,a) 문자열 */
export function hexToRgba(hex: string, alpha: number): string {
	const value = hex.replace('#', '');
	const r = parseInt(value.slice(0, 2), 16);
	const g = parseInt(value.slice(2, 4), 16);
	const b = parseInt(value.slice(4, 6), 16);
	return `rgba(${r},${g},${b},${alpha})`;
}

/** 프리셋 id → 그라데이션 데이터 — 미지정·잘못된 id는 DEFAULT_PRESET_ID(plum)로 폴백해요 */
function presetGradient(id: string | null | undefined): GreetingPresetGradient {
	return (id && GREETING_PRESET_GRADIENTS[id]) || GREETING_PRESET_GRADIENTS[DEFAULT_PRESET_ID];
}

/** 프리셋 배경을 그리는 데 필요한 모든 데이터 — 런타임 렌더러는 이 계획을 캔버스 호출로 옮기기만 해요 */
export interface GreetingPresetBackgroundPlan {
	/** 바닥 단색 */
	base: string;
	/** 대각 그라디언트 — 시작(0, 카드 높이)·끝(카드 폭, 0), 스톱은 [오프셋, 색] */
	linear: { x0: number; y0: number; x1: number; y1: number; stops: readonly (readonly [number, string])[] };
	/** 코너 글로우 방사 그라디언트 — 중심·반지름은 카드 크기에 비례해요 */
	glow: { cx: number; cy: number; radius: number; stops: readonly (readonly [number, string])[] };
	/** 그라디언트 위 어두운 스크림 색 */
	scrim: string;
}

/** 프리셋 배경 계획 — cardWidth×cardHeight 카드에서 presetId 프리셋을 그리는 색·기하 데이터 */
export function greetingPresetBackgroundPlan(cardWidth: number, cardHeight: number, presetId: string | null): GreetingPresetBackgroundPlan {
	const preset = presetGradient(presetId);
	return {
		base: preset.base,
		linear: {
			x0: 0,
			y0: cardHeight,
			x1: cardWidth,
			y1: 0,
			stops: [
				[0, preset.from],
				[1, preset.to]
			]
		},
		glow: {
			cx: cardWidth * GLOW_GEOMETRY.centerX,
			cy: cardHeight * GLOW_GEOMETRY.centerY,
			radius: cardWidth * GLOW_GEOMETRY.radiusFactor,
			stops: [
				[0, hexToRgba(preset.glow, GLOW_GEOMETRY.innerAlpha)],
				[1, hexToRgba(preset.glow, GLOW_GEOMETRY.outerAlpha)]
			]
		},
		scrim: GREETING_PRESET_SCRIM
	};
}
