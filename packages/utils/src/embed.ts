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

/** 현재 실행 맥락(서버)의 강조색 '#RRGGBB'를 돌려주는 훅. 봇이 시작할 때 한 번 등록해요 (utils는 node 전용 API를 쓰지 않아요). */
let contextAccentResolver: (() => string | null | undefined) | null = null;

export function setContextAccentResolver(resolver: (() => string | null | undefined) | null): void {
	contextAccentResolver = resolver;
}

/** 컨테이너에 쓸 강조색 숫자 — 명시 값 → 서버 맥락 색 → 봇 기본색 순이에요. */
export function resolveAccentColor(accentColor?: string | null): number {
	const explicit = accentColor ? hexColorToInt(accentColor) : undefined;
	if (explicit !== undefined) return explicit;
	const contextual = contextAccentResolver?.();
	return (contextual ? hexColorToInt(contextual) : undefined) ?? DEFAULT_COLOR;
}

export function createContainer(accentColor?: string | null): ContainerBuilder {
	const container = new ContainerBuilder();
	// 명시 강조색(#RRGGBB) → 서버 강조색(맥락) → 봇 기본색. 형식이 틀린 값은 건너뛰어요.
	container.setAccentColor(resolveAccentColor(accentColor));
	return container;
}

export function createThumbnail(url: string): ThumbnailBuilder {
	const thumbnail = new ThumbnailBuilder();
	thumbnail.setURL(url);
	return thumbnail;
}
