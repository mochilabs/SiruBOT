/**
 * 인사 카드 렌더러(satori) — 환영/작별 카드 PNG예요. 노드는 `@sirubot/cards`의 `greetingCard`가 만들어요.
 * 대시보드 미리보기도 같은 함수를 쓰니, 여기서는 node 전용 일(아바타 받기, 읽을 수 없는 이미지 걸러내기, PNG 변환)만 해요.
 */
import { createAsyncLru, greetingCard, imageSizeOf } from '@sirubot/cards';
import { GREETING_CARD_H, GREETING_CARD_W, GREETING_RENDER_SCALE, type GreetingImage } from '@sirubot/utils';
import { getLogger } from '../../utils/logger.ts';
import { decodeDataUri, type GreetingCardContext } from '../memberGreetingCard.ts';
import { fetchImageDataUri, renderSatoriPng } from './satoriKit.ts';

const logger = getLogger('greetingCardSatori');

/** 같은 멤버의 반복 렌더(미리보기 연타 등)에서 아바타 다운로드를 건너뛰어요. */
const loadAvatar = createAsyncLru<string>(64, (url) => fetchImageDataUri(url));

/** resvg가 읽을 수 있는(PNG·JPEG·GIF) data URI인지 — 헤더 크기를 읽을 수 있으면 true예요. */
function isRenderableDataUri(dataUri: string): boolean {
	const buffer = decodeDataUri(dataUri);
	const size = buffer ? imageSizeOf(buffer) : null;
	return size !== null && size.width > 0 && size.height > 0;
}

/**
 * resvg가 못 읽는 업로드 이미지를 미리 걸러내요 — 그대로 두면 satori는 통과하고 resvg가 빈 칸으로 그려요.
 * 배경은 프리셋으로, 이미지 레이어는 그 레이어만 건너뛰어요 (skia 렌더러와 같은 폴백 규칙).
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

/** 인사 카드 PNG — skia 렌더러와 같은 출력 크기(1200×675 × GREETING_RENDER_SCALE)예요. */
export async function renderGreetingCardSatori(image: GreetingImage, context: GreetingCardContext): Promise<Buffer> {
	const avatar = context.avatarUrl ? await loadAvatar(context.avatarUrl) : null;
	const node = greetingCard(sanitizeImage(image), {
		displayName: context.displayName,
		guildName: context.guildName,
		memberCount: context.memberCount,
		avatar
	});
	return renderSatoriPng(node, {
		width: GREETING_CARD_W,
		height: GREETING_CARD_H,
		outputWidth: Math.round(GREETING_CARD_W * GREETING_RENDER_SCALE)
	});
}
