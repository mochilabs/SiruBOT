import { MUSIC_VOLUME_MAX, MUSIC_VOLUME_MIN } from './playerLimits.js';

export const THEME_PRESETS = ['pink', 'blue', 'purple', 'green', 'orange', 'yellow'] as const;
export type ThemePreset = (typeof THEME_PRESETS)[number];
export const THEME_PRESET_DEFAULT: ThemePreset = 'pink';

export const THEME_PRESET_LABELS: Record<ThemePreset, string> = {
	pink: '분홍',
	blue: '파랑',
	purple: '보라',
	green: '초록',
	orange: '주황',
	yellow: '노랑'
};

export const THEME_PRESET_HEX: Record<ThemePreset, string> = {
	pink: '#ff85c0',
	blue: '#5b9dff',
	purple: '#a78bfa',
	green: '#4ade80',
	orange: '#ffa24d',
	yellow: '#fbd24a'
};

export function normalizeThemePreset(value: string | null | undefined): ThemePreset {
	return value && (THEME_PRESETS as readonly string[]).includes(value) ? (value as ThemePreset) : THEME_PRESET_DEFAULT;
}

export function themeEmojiName(name: string, preset: ThemePreset): string {
	return preset === THEME_PRESET_DEFAULT ? name : `${name}_${preset}`;
}

export const AI_MODES = ['all', 'channels', 'off'] as const;
export type AiMode = (typeof AI_MODES)[number];
export const AI_MODE_DEFAULT: AiMode = 'all';

export function normalizeAiMode(value: string | null | undefined): AiMode {
	return value && (AI_MODES as readonly string[]).includes(value) ? (value as AiMode) : AI_MODE_DEFAULT;
}

export const REPEAT_MODES = ['off', 'track', 'queue'] as const;
export type RepeatModeSetting = (typeof REPEAT_MODES)[number];
export const REPEAT_MODE_DEFAULT: RepeatModeSetting = 'off';

export function normalizeRepeatMode(value: string | null | undefined): RepeatModeSetting {
	return value && (REPEAT_MODES as readonly string[]).includes(value) ? (value as RepeatModeSetting) : REPEAT_MODE_DEFAULT;
}

export function isRepeatMode(value: string): value is RepeatModeSetting {
	return (REPEAT_MODES as readonly string[]).includes(value);
}

export const TEXT_CHANNEL_MODES = ['play', 'select'] as const;
export type TextChannelModeSetting = (typeof TEXT_CHANNEL_MODES)[number];
export const TEXT_CHANNEL_MODE_DEFAULT: TextChannelModeSetting = 'play';

export function normalizeTextChannelMode(value: string | null | undefined): TextChannelModeSetting {
	return value && (TEXT_CHANNEL_MODES as readonly string[]).includes(value) ? (value as TextChannelModeSetting) : TEXT_CHANNEL_MODE_DEFAULT;
}

export const TTS_ANNOUNCE_MODES = ['sequential', 'parallel', 'interrupt'] as const;
export type TtsAnnounceModeSetting = (typeof TTS_ANNOUNCE_MODES)[number];
export const TTS_ANNOUNCE_MODE_DEFAULT: TtsAnnounceModeSetting = 'sequential';

export function normalizeTtsAnnounceMode(value: string | null | undefined): TtsAnnounceModeSetting {
	return value && (TTS_ANNOUNCE_MODES as readonly string[]).includes(value) ? (value as TtsAnnounceModeSetting) : TTS_ANNOUNCE_MODE_DEFAULT;
}

export const SPONSORBLOCK_SEGMENTS = ['sponsor', 'selfpromo', 'interaction', 'intro', 'outro', 'preview', 'music_offtopic', 'filler'] as const;
export type SponsorBlockSegment = (typeof SPONSORBLOCK_SEGMENTS)[number];

export function normalizeSponsorBlockSegments(values: readonly string[]): SponsorBlockSegment[] {
	const allowed = new Set<string>(SPONSORBLOCK_SEGMENTS);
	return values.filter((value): value is SponsorBlockSegment => allowed.has(value));
}

export const MUSIC_VOLUME_RANGE = { min: MUSIC_VOLUME_MIN, max: MUSIC_VOLUME_MAX } as const;

export const TTS_VOLUME_RANGE = { min: 0, max: MUSIC_VOLUME_MAX } as const;

export const TTS_DUCK_LEVEL_RANGE = { min: 0, max: 1 } as const;

// 15s upper bound is the Lavalink mixer plugin's overlap limit.
export const CROSSFADE_MS_RANGE = { min: 500, max: 15000 } as const;

export const AUTOMIX_MAX_TEMPO_CHANGE_RANGE = { min: 0, max: 0.12 } as const;

export const AUTOMIX_MIN_CONFIDENCE_RANGE = { min: 0, max: 1 } as const;

export const JTC_USER_LIMIT_RANGE = { min: 0, max: 99 } as const;

export const JTC_TEMPLATE_MAX_LENGTH = 100;
