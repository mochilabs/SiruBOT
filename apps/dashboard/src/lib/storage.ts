import { ASSET_BUCKET, sniffImageMime } from "@sirubot/utils";

/**
 * 스토리지(apps/storage) 클라이언트 — 길드 이미지 에셋 원본을 올리고 지워요.
 * data-api 클라이언트와 같은 규율이에요:
 * - env는 서버 전용(process.env) — 클라이언트 번들로 절대 노출하지 않아요
 * - `STORAGE_AUTH_KEY ?? AUTH_KEY` 폴백, 키가 없으면 호출 전면 스킵하고 한국어 에러를 throw해요
 * - `Authorization` 헤더는 Bearer 스킴 없이 키 원문 그대로 (apps/storage plugins/auth.ts 계약)
 * - 타임아웃 15초 (`AbortSignal.timeout`), 실패 시 스토리지 응답의 한국어 메시지를 그대로 전달해요
 */
const STORAGE_URL = process.env.STORAGE_URL || "http://localhost:3003";
const STORAGE_AUTH_KEY = process.env.STORAGE_AUTH_KEY || process.env.AUTH_KEY || "";

/** PUT /:bucket/*key 성공 응답 — url은 스토리지가 발급한 공개 URL이라 그대로 저장해요 */
export interface PutAssetResult {
	bucket: string;
	key: string;
	url: string;
	size: number;
	contentType: string;
}

const NOT_CONFIGURED_MESSAGE = "이미지 저장소가 설정되지 않았어요. (STORAGE_AUTH_KEY 또는 AUTH_KEY 미설정)";
const NETWORK_MESSAGE = "이미지 저장소에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.";

/** 스토리지가 설정됐는지 (키 없으면 false — 라우트에서 502 안내에 써요) */
export function isStorageConfigured(): boolean {
	return STORAGE_AUTH_KEY.trim().length > 0;
}

/** 업로드 (원시 바이트 PUT). 실패하면 한국어 사유를 throw해요 */
export async function putAssetObject(key: string, bytes: Uint8Array): Promise<PutAssetResult> {
	// Content-Type은 안내용일 뿐 스토리지는 매직 바이트로 형식을 판별해요 — 가능한 한 정확하게 보내요
	const contentType = sniffImageMime(bytes) ?? "application/octet-stream";

	const res = await requestStorage(`/${ASSET_BUCKET}/${encodeKeyPath(key)}`, {
		method: "PUT",
		headers: { "Content-Type": contentType },
		// 바이트를 그대로 보내되 fetch BodyInit 타입과 맞추기 위해 뷰를 복사해요 (타입스크립트 ArrayBufferLike 대응)
		body: new Uint8Array(bytes)
	});

	if (!res.ok) throw new Error(await storageFailureMessage(res, "이미지를 저장하지 못했어요. 잠시 후 다시 시도해 주세요."));
	const payload = (await res.json().catch(() => null)) as Partial<PutAssetResult> | null;
	if (!payload || typeof payload.url !== "string" || !payload.url) {
		throw new Error("이미지 저장소가 올바른 응답을 보내지 않았어요. 잠시 후 다시 시도해 주세요.");
	}
	return {
		bucket: typeof payload.bucket === "string" ? payload.bucket : ASSET_BUCKET,
		key: typeof payload.key === "string" ? payload.key : key,
		url: payload.url,
		size: typeof payload.size === "number" ? payload.size : bytes.length,
		contentType: typeof payload.contentType === "string" ? payload.contentType : contentType
	};
}

/** 삭제 — 404는 성공으로 취급해요 (이미 없는 파일). 그 외 실패는 한국어 사유를 throw해요 */
export async function deleteAssetObject(bucket: string, key: string): Promise<void> {
	const res = await requestStorage(`/${encodeURIComponent(bucket)}/${encodeKeyPath(key)}`, {
		method: "DELETE"
	});
	if (res.ok || res.status === 404) return;
	throw new Error(await storageFailureMessage(res, "이미지를 삭제하지 못했어요. 잠시 후 다시 시도해 주세요."));
}

function requireAuthKey(): string {
	const authKey = STORAGE_AUTH_KEY.trim();
	if (!authKey) {
		console.warn("[storage] STORAGE_AUTH_KEY/AUTH_KEY 미설정 — 스토리지 호출을 건너뛴다.");
		throw new Error(NOT_CONFIGURED_MESSAGE);
	}
	return authKey;
}

/** 키의 각 경로 조각을 인코딩해요 — 조각 자체는 공용 계약상 안전한 문자만 쓰지만 방어적으로 감싸요 */
function encodeKeyPath(key: string): string {
	return key
		.split("/")
		.map((segment) => encodeURIComponent(segment))
		.join("/");
}

async function requestStorage(path: string, init: RequestInit): Promise<Response> {
	const authKey = requireAuthKey();
	try {
		return await fetch(`${STORAGE_URL}${path}`, {
			...init,
			cache: "no-store",
			headers: { ...init.headers, Authorization: authKey },
			signal: AbortSignal.timeout(15_000)
		});
	} catch {
		throw new Error(NETWORK_MESSAGE);
	}
}

/** 스토리지 실패 응답의 한국어 메시지를 그대로 전달하고, 본문이 없으면 상태에 맞는 fallback을 써요 */
async function storageFailureMessage(res: Response, fallback: string): Promise<string> {
	const payload = (await res.json().catch(() => null)) as { error?: unknown; message?: unknown } | null;
	const message = [payload?.error, payload?.message].find(
		(value): value is string => typeof value === "string" && value.trim().length > 0,
	);
	if (message) return message;
	if (res.status === 400) return "이미지 형식이나 경로가 올바르지 않아요.";
	if (res.status === 401) return "이미지 저장소 인증에 실패했어요. 관리자에게 문의해 주세요.";
	if (res.status === 413) return "이미지가 너무 커요. 더 작은 파일로 다시 시도해 주세요.";
	return fallback;
}
