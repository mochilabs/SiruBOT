import { THEME_PRESET_DEFAULT, normalizeThemePreset, type ThemePreset } from './guildSettingsContract.js';

let resolver: (() => string | null | undefined) | null = null;

export function setContextThemeResolver(next: (() => string | null | undefined) | null): void {
	resolver = next;
}

export function currentThemePreset(): ThemePreset {
	return resolver ? normalizeThemePreset(resolver()) : THEME_PRESET_DEFAULT;
}
