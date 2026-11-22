/**
 * 인사 카드 렌더러(Takumi) — 환영/작별 카드 PNG예요. 노드는 `@sirubot/cards`의 `greetingCard`가 만들어요.
 * 대시보드 미리보기도 같은 함수를 쓰니, 여기서는 node 전용 일(아바타 받기, 읽을 수 없는 이미지 걸러내기, PNG 변환)만 해요.
 */
import type { ReactNode } from 'react';
import { createAsyncLru, greetingAnimationCss, greetingCard, imageSizeOf } from '@sirubot/cards';
import {
	GREETING_ANIMATION_FPS,
	GREETING_CARD_H,
	GREETING_CARD_W,
	GREETING_RENDER_SCALE,
	greetingAnimationDurationMs,
	hasGreetingAnimation,
	type GreetingImage
} from '@sirubot/utils';
import { getLogger } from '../../utils/logger.ts';
import { decodeDataUri, type GreetingCardContext } from '../memberGreetingCard.ts';
import { createSemaphore } from '../../utils/semaphore.ts';
import { fetchImageDataUri, renderCardAnimation, renderCardPng } from './takumiKit.tsx';

const logger = getLogger('greetingCard');

/** 같은 멤버의 반복 렌더(미리보기 연타 등)에서 아바타 다운로드를 건너뛰어요. */
const loadAvatar = createAsyncLru<string>(64, (url) => fetchImageDataUri(url));

/** Takumi가 읽을 수 있는(PNG·JPEG·GIF·WebP) data URI인지 — 헤더 크기를 읽을 수 있으면 true예요. */
function isRenderableDataUri(dataUri: string): boolean {
	const buffer = decodeDataUri(dataUri);
	const size = buffer ? imageSizeOf(buffer) : null;
	return size !== null && size.width > 0 && size.height > 0;
}

/**
 * Takumi가 못 읽는 업로드 이미지를 미리 걸러내요 — 그대로 두면 렌더가 빈 칸으로 그려요.
 * 배경은 프리셋으로, 이미지 레이어는 그 레이어만 건너뛰어요.
 */
function sanitizeImage(image: GreetingImage): GreetingImage {
	let background = image.background;
	if (background.dataUri && !isRenderableDataUri(background.dataUri)) {
		logger.warn('greeting background dataUri is not decodable, falling back to preset');
		background = { ...background, dataUri: null };
	}
	const layers = image.layers.filter((layer) => {
		if (layer.type !== 'image' || isRenderableDataUri(layer.dataUri)) return true;
		logger.warn('greeting image layer dataUri is not decodable, skipping the layer');
		return false;
	});
	return { background, layers };
}

/** 애니메이션 WebP는 CPU를 오래 써서 동시에 이만큼만 그려요 (입장이 몰려도 서버가 밀리지 않게) */
const ANIMATION_CONCURRENCY = 2;
const limitAnimation = createSemaphore(ANIMATION_CONCURRENCY);

export interface GreetingCardImage {
	buffer: Buffer;
	contentType: 'image/png' | 'image/webp';
}

/**
 * 인사 카드 — 출력 크기(1200×675 × GREETING_RENDER_SCALE)예요. 움직이는 레이어가 하나라도 있으면 애니메이션 WebP(무한 반복),
 * 없으면 PNG로 그려요. 결과의 `contentType`으로 호출자가 파일 확장자를 정해요.
 */
export async function renderGreetingCard(image: GreetingImage, context: GreetingCardContext): Promise<GreetingCardImage> {
	const avatar = context.avatarUrl ? await loadAvatar(context.avatarUrl) : null;
	const safe = sanitizeImage(image);
	const node = greetingCard(safe, {
		displayName: context.displayName,
		guildName: context.guildName,
		memberCount: context.memberCount,
		avatar
	}) as unknown as ReactNode;
	const outputWidth = Math.round(GREETING_CARD_W * GREETING_RENDER_SCALE);

	if (hasGreetingAnimation(safe)) {
		const buffer = await limitAnimation(() =>
			renderCardAnimation(node, {
				width: GREETING_CARD_W,
				height: GREETING_CARD_H,
				outputWidth,
				css: greetingAnimationCss(safe),
				durationMs: greetingAnimationDurationMs(safe),
				fps: GREETING_ANIMATION_FPS
			})
		);
		return { buffer, contentType: 'image/webp' };
	}
	const buffer = await renderCardPng(node, { width: GREETING_CARD_W, height: GREETING_CARD_H, outputWidth });
	return { buffer, contentType: 'image/png' };
}
