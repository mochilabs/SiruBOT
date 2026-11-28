import { ContainerBuilder, SeparatorBuilder, ThumbnailBuilder, SeparatorSpacingSize } from 'discord.js';
import { DEFAULT_COLOR } from './constants.js';
import { THEME_PRESET_HEX } from './guildSettingsContract.js';
import { currentThemePreset } from './themeContext.js';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function hexColorToInt(hex: string): number | undefined {
	if (!HEX_COLOR.test(hex)) return undefined;
	return Number.parseInt(hex.slice(1), 16);
}

export function createSeparator(): SeparatorBuilder {
	return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
}

export function addSeparator(container: ContainerBuilder): void {
	container.addSeparatorComponents(createSeparator());
}

export function resolveAccentColor(accentColor?: string | null): number {
	const explicit = accentColor ? hexColorToInt(accentColor) : undefined;
	if (explicit !== undefined) return explicit;
	return hexColorToInt(THEME_PRESET_HEX[currentThemePreset()]) ?? DEFAULT_COLOR;
}

export function createContainer(accentColor?: string | null): ContainerBuilder {
	const container = new ContainerBuilder();
	container.setAccentColor(resolveAccentColor(accentColor));
	return container;
}

export function createThumbnail(url: string): ThumbnailBuilder {
	const thumbnail = new ThumbnailBuilder();
	thumbnail.setURL(url);
	return thumbnail;
}
