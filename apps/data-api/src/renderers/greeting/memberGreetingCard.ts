import { imageSizeOf } from '@sirubot/cards';
import { GREETING_ANIMATION_MAX_MS, parseGifTiming } from '@sirubot/utils';
import { reencodeAnimatedGif, reencodeImage } from '../shared/takumiKit.tsx';

export class GreetingBackgroundError extends Error {
	public constructor(
		public readonly identifier: string,
		message: string
	) {
		super(message);
		this.name = 'GreetingBackgroundError';
	}
}

const INVALID_IMAGE_MESSAGE = '이미지를 읽을 수 없어요. PNG·JPEG·WEBP 파일로 다시 시도해 주세요.';
const IMAGE_TOO_LARGE_MESSAGE = '이미지를 충분히 줄일 수 없어요. 더 작은 이미지로 시도해 주세요.';

export function decodeDataUri(dataUri: string): Buffer | null {
	const comma = dataUri.indexOf(',');
	if (comma < 0) return null;
	const buffer = Buffer.from(dataUri.slice(comma + 1), 'base64');
	return buffer.length > 0 ? buffer : null;
}

export interface GreetingCardContext {
	userId: string;
	displayName: string;
	guildName: string;
	memberCount: number;
	avatarUrl: string | null;
}

const IMAGE_MAX_BYTES = 900_000;
const IMAGE_STEP_PX = 200;
const BG_MAX_SIDE = 1600;
const BG_MIN_SIDE = 320;
const BG_QUALITY = 82;
const LAYER_MAX_SIDE = 1200;
const LAYER_MIN_SIDE = 200;

interface NormalizeUploadedImageOptions {
	maxSide: number;
	minSide: number;
}

async function normalizeUploadedImage(
	dataUri: string,
	options: NormalizeUploadedImageOptions,
	encode: { format: 'jpeg'; quality: number } | { format: 'png' }
): Promise<string> {
	const raw = decodeDataUri(dataUri);
	const natural = raw ? imageSizeOf(raw) : null;
	if (!natural || !natural.width || !natural.height) {
		throw new GreetingBackgroundError('invalid_image', INVALID_IMAGE_MESSAGE);
	}
	const { width: iw, height: ih } = natural;

	let scale = Math.min(1, options.maxSide / Math.max(iw, ih));
	for (;;) {
		const w = Math.max(1, Math.round(iw * scale));
		const h = Math.max(1, Math.round(ih * scale));
		let encoded: Buffer;
		try {
			encoded = await reencodeImage(dataUri, { width: w, height: h }, encode);
		} catch {
			throw new GreetingBackgroundError('invalid_image', INVALID_IMAGE_MESSAGE);
		}
		if (encoded.length <= IMAGE_MAX_BYTES) {
			return `data:image/${encode.format};base64,${encoded.toString('base64')}`;
		}
		const longest = Math.max(w, h);
		const nextLongest = longest - IMAGE_STEP_PX;
		if (nextLongest < options.minSide) {
			throw new GreetingBackgroundError('image_too_large', IMAGE_TOO_LARGE_MESSAGE);
		}
		scale = scale * (nextLongest / longest);
	}
}

const GIF_MAX_SIDE = 1200;
const GIF_MIN_SIDE = 240;
const GIF_MAX_FRAMES = 100;
const GIF_FPS_START = 15;
const GIF_FPS_MIN = 8;

async function normalizeBackgroundGif(dataUri: string, raw: Buffer): Promise<string> {
	const timing = parseGifTiming(raw);
	if (!timing) throw new GreetingBackgroundError('invalid_image', INVALID_IMAGE_MESSAGE);
	if (timing.frames <= 1) {
		return normalizeUploadedImage(dataUri, { maxSide: BG_MAX_SIDE, minSide: BG_MIN_SIDE }, { format: 'jpeg', quality: BG_QUALITY });
	}
	const longest = Math.max(timing.width, timing.height);
	if (
		raw.length <= IMAGE_MAX_BYTES &&
		longest <= GIF_MAX_SIDE &&
		timing.frames <= GIF_MAX_FRAMES &&
		timing.durationMs <= GREETING_ANIMATION_MAX_MS
	) {
		return dataUri;
	}

	const durationMs = Math.min(timing.durationMs, GREETING_ANIMATION_MAX_MS);
	let scale = Math.min(1, GIF_MAX_SIDE / longest);
	let fps = GIF_FPS_START;
	for (;;) {
		const width = Math.max(1, Math.round(timing.width * scale));
		const height = Math.max(1, Math.round(timing.height * scale));
		let encoded: Buffer;
		try {
			encoded = await reencodeAnimatedGif(dataUri, { width, height, fps, durationMs });
		} catch {
			throw new GreetingBackgroundError('invalid_image', INVALID_IMAGE_MESSAGE);
		}
		if (encoded.length <= IMAGE_MAX_BYTES) return `data:image/gif;base64,${encoded.toString('base64')}`;
		if (Math.max(width, height) * 0.8 < GIF_MIN_SIDE) throw new GreetingBackgroundError('image_too_large', IMAGE_TOO_LARGE_MESSAGE);
		scale *= 0.8;
		fps = Math.max(GIF_FPS_MIN, fps - 2);
	}
}

export async function normalizeGreetingBackground(dataUri: string): Promise<string> {
	if (dataUri.startsWith('data:image/gif;')) {
		const raw = decodeDataUri(dataUri);
		if (!raw) throw new GreetingBackgroundError('invalid_image', INVALID_IMAGE_MESSAGE);
		return normalizeBackgroundGif(dataUri, raw);
	}
	return normalizeUploadedImage(dataUri, { maxSide: BG_MAX_SIDE, minSide: BG_MIN_SIDE }, { format: 'jpeg', quality: BG_QUALITY });
}

export async function normalizeGreetingLayerImage(dataUri: string): Promise<string> {
	return normalizeUploadedImage(dataUri, { maxSide: LAYER_MAX_SIDE, minSide: LAYER_MIN_SIDE }, { format: 'png' });
}
