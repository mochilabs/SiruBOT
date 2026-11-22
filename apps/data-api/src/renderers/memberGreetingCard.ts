/**
 * 멤버 인사 카드 공용 타입·업로드 이미지 정규화.
 * 카드 PNG 렌더링은 `takumi/greetingCard.ts`가 맡고, 이 파일은 대시보드에서 올라온 배경/스티커 이미지를 저장 규격에 맞게 축소·재인코딩해요.
 */
import { imageSizeOf } from '@sirubot/cards';
import { GREETING_ANIMATION_MAX_MS, parseGifTiming } from '@sirubot/utils';
import { reencodeAnimatedGif, reencodeImage } from './takumi/takumiKit.tsx';

/** 인사 배경 정규화/디코딩 실패 — 라우트가 400으로 매핑해요 (WeatherError/DeliveryError와 같은 패턴) */
export class GreetingBackgroundError extends Error {
	public constructor(
		public readonly identifier: string,
		message: string
	) {
		super(message);
		this.name = 'GreetingBackgroundError';
	}
}

/** 업로드 이미지 디코딩 실패: 라우트가 그대로 400으로 내려요 */
const INVALID_IMAGE_MESSAGE = '이미지를 읽을 수 없어요. PNG·JPEG·WEBP 파일로 다시 시도해 주세요.';
/** 바이트 상한을 낮춰도 못 줄인 입력: 더 작은 이미지를 요구해요 */
const IMAGE_TOO_LARGE_MESSAGE = '이미지를 충분히 줄일 수 없어요. 더 작은 이미지로 시도해 주세요.';

/** dataURI에서 base64 본문만 떼어 Buffer로 — 손상 입력은 null (호출자가 폴백해요) */
export function decodeDataUri(dataUri: string): Buffer | null {
	const comma = dataUri.indexOf(',');
	if (comma < 0) return null;
	const buffer = Buffer.from(dataUri.slice(comma + 1), 'base64');
	return buffer.length > 0 ? buffer : null;
}

export interface GreetingCardContext {
	userId: string;
	displayName: string;
	/** 이미지 텍스트의 {서버} 토큰 — 호출자(봇)가 모르면 빈 문자열 */
	guildName: string;
	memberCount: number;
	avatarUrl: string | null;
}

// 업로드 이미지 정규화: 대시보드 업로드를 저장 규격으로 맞춰요
// dataURI를 Prisma Json 컬럼에 통째로 저장하는 관계로, 저장 비용 상한이 필요해요.
// 문자 길이가 아니라 재인코딩 결과 바이너리 기준으로 판정해요.
// 배경(1600px·JPEG)과 레이어(1200px·PNG)는 상수·포맷만 달라요.
const IMAGE_MAX_BYTES = 900_000;
const IMAGE_STEP_PX = 200;
const BG_MAX_SIDE = 1600;
const BG_MIN_SIDE = 320;
const BG_QUALITY = 82;
const LAYER_MAX_SIDE = 1200;
const LAYER_MIN_SIDE = 200;

interface NormalizeUploadedImageOptions {
	/** 첫 목표 — 가장 긴 변을 이 값 이하로 줄여요 */
	maxSide: number;
	/** 바이트 상한을 못 넘겼을 때의 하한 — 이보다 작아지면 image_too_large로 실패해요 */
	minSide: number;
}

/**
 * 업로드 이미지 축소·재인코딩 공용 파이프라인: 헤더 크기 확인 → 첫 축소 →
 * 재인코딩 결과가 IMAGE_MAX_BYTES를 넘으면 가장 긴 변을 IMAGE_STEP_PX씩 더 줄여요.
 * 리턴은 data:image/jpeg;base64,… (배경) 또는 data:image/png;base64,… (레이어).
 */
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

	// 첫 목표 — 가장 긴 변 maxSide 이하
	let scale = Math.min(1, options.maxSide / Math.max(iw, ih));
	for (;;) {
		const w = Math.max(1, Math.round(iw * scale));
		const h = Math.max(1, Math.round(ih * scale));
		let encoded: Buffer;
		try {
			encoded = await reencodeImage(dataUri, { width: w, height: h }, encode);
		} catch {
			// 헤더는 읽혔지만 본문을 디코딩하지 못한 손상 이미지
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

// 움직이는 GIF 배경: 카드 출력이 800px 폭이라 레이아웃 폭(1200px)보다 큰 건 낭비예요. 프레임이 많을수록 렌더(디코딩)가 느려서 길이·프레임에도 상한을 둬요.
const GIF_MAX_SIDE = 1200;
const GIF_MIN_SIDE = 240;
const GIF_MAX_FRAMES = 100;
const GIF_FPS_START = 15;
const GIF_FPS_MIN = 8;

/**
 * 움직이는 GIF 배경 정규화. 상한 안이면 원본을 그대로 돌려줘요(화질 손실 없음).
 * 넘으면 크기를 줄이고(최대 1200px) 5초까지만 잘라서 GIF로 다시 인코딩해요 — 900KB 이하가 될 때까지 크기·fps를 단계적으로 낮춰요.
 * 정지 GIF(프레임 1개)는 일반 이미지처럼 JPEG로 정규화해요.
 */
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

/**
 * 업로드 배경 축소·재인코딩: 가장 긴 변 BG_MAX_SIDE, JPEG 품질 BG_QUALITY를 써요.
 * IMAGE_MAX_BYTES를 넘으면 IMAGE_STEP_PX씩 더 줄여요. 리턴은 data:image/jpeg;base64,…
 * 움직이는 GIF는 애니메이션을 지켜야 해서 GIF로 정규화해요(`normalizeBackgroundGif`) — 리턴은 data:image/gif;base64,…
 */
export async function normalizeGreetingBackground(dataUri: string): Promise<string> {
	if (dataUri.startsWith('data:image/gif;')) {
		const raw = decodeDataUri(dataUri);
		if (!raw) throw new GreetingBackgroundError('invalid_image', INVALID_IMAGE_MESSAGE);
		return normalizeBackgroundGif(dataUri, raw);
	}
	return normalizeUploadedImage(dataUri, { maxSide: BG_MAX_SIDE, minSide: BG_MIN_SIDE }, { format: 'jpeg', quality: BG_QUALITY });
}

/**
 * 업로드 이미지 레이어 축소·재인코딩: 투명도를 보존하기 위해 PNG로 저장해요.
 * 가장 긴 변 LAYER_MAX_SIDE, IMAGE_MAX_BYTES를 넘으면 IMAGE_STEP_PX씩 더 줄여요. 리턴은 data:image/png;base64,…
 * 레이어는 움직이는 GIF를 쓰지 않아요 — GIF가 들어오면 첫 프레임만 PNG로 만들어요.
 */
export async function normalizeGreetingLayerImage(dataUri: string): Promise<string> {
	return normalizeUploadedImage(dataUri, { maxSide: LAYER_MAX_SIDE, minSide: LAYER_MIN_SIDE }, { format: 'png' });
}
