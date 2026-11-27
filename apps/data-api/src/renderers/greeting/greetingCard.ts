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
import { decodeDataUri, type GreetingCardContext } from './memberGreetingCard.ts';
import { createSemaphore } from '../../utils/semaphore.ts';
import { fetchImageDataUri, renderCardAnimation, renderCardPng } from '../shared/takumiKit.tsx';

const logger = getLogger('greetingCard');

const loadAvatar = createAsyncLru<string>(64, (url) => fetchImageDataUri(url));

function isRenderableDataUri(dataUri: string): boolean {
	const buffer = decodeDataUri(dataUri);
	const size = buffer ? imageSizeOf(buffer) : null;
	return size !== null && size.width > 0 && size.height > 0;
}

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

const ANIMATION_CONCURRENCY = 2;
const limitAnimation = createSemaphore(ANIMATION_CONCURRENCY);

export interface GreetingCardImage {
	buffer: Buffer;
	contentType: 'image/png' | 'image/webp';
}

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
