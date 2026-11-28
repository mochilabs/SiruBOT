// 프록시에서 image/*로 넘어가지 않게 직접 내려받아 data: URL로 변환해요
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_FETCH_TIMEOUT_MS = 15_000;

export const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];

export function normalizeImageType(raw: string | null | undefined): SupportedImageType | null {
	const type = (raw ?? '').split(';')[0]!.trim().toLowerCase();
	if (type === 'image/jpg' || type === 'image/pjpeg') return 'image/jpeg';
	return (SUPPORTED_IMAGE_TYPES as readonly string[]).includes(type) ? (type as SupportedImageType) : null;
}

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
