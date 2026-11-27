import { ASSET_BUCKET, sniffImageMime } from "@sirubot/utils/storage";

import { getStorageEnv } from "@/lib/env";

export interface PutAssetResult {
	bucket: string;
	key: string;
	url: string;
	size: number;
	contentType: string;
}

const NOT_CONFIGURED_MESSAGE = "이미지 저장소가 설정되지 않았어요. (STORAGE_AUTH_KEY 또는 AUTH_KEY 미설정)";
const NETWORK_MESSAGE = "이미지 저장소에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.";

export async function putAssetObject(key: string, bytes: Uint8Array): Promise<PutAssetResult> {
	const contentType = sniffImageMime(bytes) ?? "application/octet-stream";

	const res = await requestStorage(`/${ASSET_BUCKET}/${encodeKeyPath(key)}`, {
		method: "PUT",
		headers: { "Content-Type": contentType },
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

export async function deleteAssetObject(bucket: string, key: string): Promise<void> {
	const res = await requestStorage(`/${encodeURIComponent(bucket)}/${encodeKeyPath(key)}`, {
		method: "DELETE"
	});
	if (res.ok || res.status === 404) return;
	throw new Error(await storageFailureMessage(res, "이미지를 삭제하지 못했어요. 잠시 후 다시 시도해 주세요."));
}

function requireAuthKey(): string {
	const { authKey } = getStorageEnv();
	if (!authKey) {
		console.warn("[storage] STORAGE_AUTH_KEY/AUTH_KEY 미설정 — 스토리지 호출을 건너뛴다.");
		throw new Error(NOT_CONFIGURED_MESSAGE);
	}
	return authKey;
}

function encodeKeyPath(key: string): string {
	return key
		.split("/")
		.map((segment) => encodeURIComponent(segment))
		.join("/");
}

async function requestStorage(path: string, init: RequestInit): Promise<Response> {
	const authKey = requireAuthKey();
	try {
		return await fetch(`${getStorageEnv().url}${path}`, {
			...init,
			cache: "no-store",
			headers: { ...init.headers, Authorization: authKey },
			signal: AbortSignal.timeout(15_000)
		});
	} catch {
		throw new Error(NETWORK_MESSAGE);
	}
}

async function storageFailureMessage(res: Response, fallback: string): Promise<string> {
	const payload = (await res.json().catch(() => null)) as { error?: unknown; message?: unknown } | null;
	const message = [payload?.error, payload?.message].find(
		(value): value is string => typeof value === "string" && value.trim().length > 0,
	);
	if (message && /[가-힣]/.test(message)) return message;
	if (res.status === 400) return "이미지 형식이나 경로가 올바르지 않아요.";
	if (res.status === 401) return "이미지 저장소 인증에 실패했어요. 관리자에게 문의해 주세요.";
	if (res.status === 413) return "이미지가 너무 커요. 더 작은 파일로 다시 시도해 주세요.";
	return fallback;
}
