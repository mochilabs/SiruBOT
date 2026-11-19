/**
 * 디스코드 첨부 이미지를 LLM에 보낼 `data:` URL로 바꾸는 공용 도우미예요 (AI 채팅·이모지 만들기).
 *
 * 첨부 URL을 `image_url`로 그대로 넘기면 OpenAI 호환 프록시가 URL에서 형식을 알지 못해 `image/*`로 보내고,
 * Gemini 같은 제공자가 `Unsupported mime type: image/*`(400)로 거절해요. 봇이 직접 받아서 실제 형식을 붙여 보내요.
 */

/** 모델에 보낼 수 있는 이미지 크기 상한 */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_FETCH_TIMEOUT_MS = 15_000;

/** 주요 비전 모델(Gemini·OpenAI 등)이 공통으로 받는 형식 — GIF는 Gemini가 거절해서 받지 않아요. */
export const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];

/** content-type 값에서 지원하는 이미지 형식만 골라요 (`image/jpg` 같은 변형과 파라미터도 받아요). */
export function normalizeImageType(raw: string | null | undefined): SupportedImageType | null {
	const type = (raw ?? '').split(';')[0]!.trim().toLowerCase();
	if (type === 'image/jpg' || type === 'image/pjpeg') return 'image/jpeg';
	return (SUPPORTED_IMAGE_TYPES as readonly string[]).includes(type) ? (type as SupportedImageType) : null;
}

/**
 * 이미지를 내려받아 `data:<형식>;base64,...`로 돌려줘요. 형식은 응답 헤더를 먼저 보고, 쓸 수 없으면 typeHint(디스코드 첨부의 contentType)를 써요.
 * 다운로드 실패·지원하지 않는 형식·상한 초과면 던져요.
 */
export async function fetchImageAsDataUrl(url: string, typeHint?: string | null): Promise<string> {
	const res = await fetch(url, { signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS) });
	if (!res.ok) throw new Error(`image download HTTP ${res.status}`);
	const declared = Number(res.headers.get('content-length'));
	if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) throw new Error(`image too large: ${declared} bytes`);
	const bytes = Buffer.from(await res.arrayBuffer());
	if (bytes.length > MAX_IMAGE_BYTES) throw new Error(`image too large: ${bytes.length} bytes`);
	const type = normalizeImageType(res.headers.get('content-type')) ?? normalizeImageType(typeHint);
	if (!type) throw new Error(`unsupported image type: ${res.headers.get('content-type') ?? typeHint ?? 'unknown'}`);
	return `data:${type};base64,${bytes.toString('base64')}`;
}
