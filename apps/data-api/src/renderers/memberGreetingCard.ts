/**
 * 멤버 인사 카드 공용 타입·업로드 이미지 정규화.
 * 카드 PNG 렌더링은 `takumi/greetingCard.ts`가 맡고, 이 파일은 대시보드에서 올라온 배경/스티커 이미지를 저장 규격에 맞게 축소·재인코딩해요.
 */
import { imageSizeOf } from '@sirubot/cards';
import { reencodeImage } from './takumi/takumiKit.tsx';

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

/**
 * 업로드 배경 축소·재인코딩: 가장 긴 변 BG_MAX_SIDE, JPEG 품질 BG_QUALITY를 써요.
 * IMAGE_MAX_BYTES를 넘으면 IMAGE_STEP_PX씩 더 줄여요. 리턴은 data:image/jpeg;base64,…
 */
export async function normalizeGreetingBackground(dataUri: string): Promise<string> {
	return normalizeUploadedImage(dataUri, { maxSide: BG_MAX_SIDE, minSide: BG_MIN_SIDE }, { format: 'jpeg', quality: BG_QUALITY });
}

/**
 * 업로드 이미지 레이어 축소·재인코딩: 투명도를 보존하기 위해 PNG로 저장해요.
 * 가장 긴 변 LAYER_MAX_SIDE, IMAGE_MAX_BYTES를 넘으면 IMAGE_STEP_PX씩 더 줄여요. 리턴은 data:image/png;base64,…
 */
export async function normalizeGreetingLayerImage(dataUri: string): Promise<string> {
	return normalizeUploadedImage(dataUri, { maxSide: LAYER_MAX_SIDE, minSide: LAYER_MIN_SIDE }, { format: 'png' });
}
