export interface GreetingPresetGradient {
	base: string;
	from: string;
	to: string;
	glow: string;
}

export const GREETING_PRESET_GRADIENTS: Record<string, GreetingPresetGradient> = {
	rose: { base: '#3d2328', from: '#d1608a', to: '#ff85c1', glow: '#ffe4f0' },
	plum: { base: '#1a0e12', from: '#231317', to: '#4d2a35', glow: '#ffb3d9' },
	gold: { base: '#231a10', from: '#8a6a44', to: '#d4a574', glow: '#f0e2cf' },
	ocean: { base: '#0e1a24', from: '#1f4f73', to: '#5fb0d9', glow: '#d6f0ff' },
	mint: { base: '#10211c', from: '#2f7a62', to: '#7fd6b0', glow: '#e0fff2' },
	sunset: { base: '#2a1410', from: '#c4533a', to: '#ffb36b', glow: '#fff0d6' },
	lavender: { base: '#1a1428', from: '#6a4fb0', to: '#b9a3ff', glow: '#efe8ff' },
	midnight: { base: '#07090f', from: '#101827', to: '#2b3a5c', glow: '#9db4ff' },
	birthday: { base: '#2b1a2e', from: '#ff6fa8', to: '#ffd166', glow: '#fff3c4' }
};

export const GREETING_PRESET_SCRIM = 'rgba(26,14,18,0.32)';

const DEFAULT_PRESET_ID = 'plum';

const GLOW_GEOMETRY = { centerX: 0.78, centerY: 0.22, radiusFactor: 0.55, innerAlpha: 0.2, outerAlpha: 0 } as const;

export function hexToRgba(hex: string, alpha: number): string {
	const value = hex.replace('#', '');
	const r = parseInt(value.slice(0, 2), 16);
	const g = parseInt(value.slice(2, 4), 16);
	const b = parseInt(value.slice(4, 6), 16);
	return `rgba(${r},${g},${b},${alpha})`;
}

function presetGradient(id: string | null | undefined): GreetingPresetGradient {
	return (id && GREETING_PRESET_GRADIENTS[id]) || GREETING_PRESET_GRADIENTS[DEFAULT_PRESET_ID];
}

export interface GreetingPresetBackgroundPlan {
	base: string;
	linear: { x0: number; y0: number; x1: number; y1: number; stops: readonly (readonly [number, string])[] };
	glow: { cx: number; cy: number; radius: number; stops: readonly (readonly [number, string])[] };
	scrim: string;
}

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
