export const TRANSITION_MODES = ['off', 'crossfade', 'automix'] as const;
export type TransitionMode = (typeof TRANSITION_MODES)[number];
export type TransitionFlags = { crossfadeEnabled: boolean; automixEnabled: boolean };
export interface TransitionSupplySettings {
	gaplessEnabled?: boolean;
	crossfadeEnabled?: boolean;
	automixEnabled?: boolean;
}

export function needsUpcomingTrack(settings: TransitionSupplySettings | null | undefined): boolean {
	if (!settings) return false;
	return Boolean(settings.gaplessEnabled || settings.crossfadeEnabled || settings.automixEnabled);
}

export function transitionMode(settings: TransitionFlags): TransitionMode {
	return settings.automixEnabled ? 'automix' : settings.crossfadeEnabled ? 'crossfade' : 'off';
}

export function transitionFlags(mode: TransitionMode): TransitionFlags {
	return { crossfadeEnabled: mode !== 'off', automixEnabled: mode === 'automix' };
}

export function isTransitionMode(value: unknown): value is TransitionMode {
	return value === 'off' || value === 'crossfade' || value === 'automix';
}

export const TRANSITION_LABELS: Record<TransitionMode, string> = {
	off: '끄기',
	crossfade: '크로스페이드',
	automix: 'AutoMix'
};
