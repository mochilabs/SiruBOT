import { ContainerBuilder, SeparatorBuilder, ThumbnailBuilder, SeparatorSpacingSize } from 'discord.js';
import { DEFAULT_COLOR } from './constants.js';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * '#RRGGBB' → 0xRRGGBB.
 * `ContainerBuilder.setAccentColor`는 숫자만 받으므로 HEX 표기를 여기서 변환해요.
 * 형식이 맞지 않으면 undefined — 호출부는 기본색으로 폴백해요.
 */
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

export function createContainer(accentColor?: string | null): ContainerBuilder {
	const container = new ContainerBuilder();
	// 커스텀 강조색(#RRGGBB)이 있으면 그 색을, 없거나 형식이 틀리면 봇 기본색을 써요.
	container.setAccentColor((accentColor ? hexColorToInt(accentColor) : undefined) ?? DEFAULT_COLOR);
	return container;
}

export function createThumbnail(url: string): ThumbnailBuilder {
	const thumbnail = new ThumbnailBuilder();
	thumbnail.setURL(url);
	return thumbnail;
}
