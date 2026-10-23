// storage 회귀 계약 — 키 미설정 시 호출 차단, Authorization은 Bearer 없이 키 원문,
// data-api·스토리지 실패 메시지 한국어 전달과 404 삭제 성공 취급을 잠가요.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ url: "http://storage.test", authKey: "storage-key" }));

vi.mock("@/lib/env", () => ({ getStorageEnv: () => env }));

import { deleteAssetObject, putAssetObject } from "@/lib/storage";

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
	env.url = "http://storage.test";
	env.authKey = "storage-key";
	fetchMock = vi.fn();
	vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("putAssetObject", () => {
	it("성공하면 발급 URL과 헤더(Bearer 없는 키 원문)를 그대로 돌려줘요", async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse({ url: "https://cdn.test/a.png" }));
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

		const result = await putAssetObject("guild/a.png", PNG_BYTES);

		expect(result.url).toBe("https://cdn.test/a.png");
		expect(result.contentType).toBe("image/png");
		expect(warn).not.toHaveBeenCalled();
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe(`http://storage.test/${result.bucket}/guild/a.png`);
		expect(init.headers).toMatchObject({ "Content-Type": "image/png", Authorization: "storage-key" });
	});

	it("키가 미설정이면 fetch 없이 설정 안내로 막아요", async () => {
		env.authKey = "";
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

		await expect(putAssetObject("guild/a.png", PNG_BYTES)).rejects.toThrow(
			"이미지 저장소가 설정되지 않았어요. (STORAGE_AUTH_KEY 또는 AUTH_KEY 미설정)",
		);
		expect(fetchMock).not.toHaveBeenCalled();
		expect(warn).toHaveBeenCalled();
	});

	it("실패 응답의 한국어 메시지를 그대로 throw해요", async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse({ error: "이미지 형식이 올바르지 않아요." }, 400));
		await expect(putAssetObject("guild/a.png", PNG_BYTES)).rejects.toThrow("이미지 형식이 올바르지 않아요.");
	});

	it("본문 없는 401은 상태 코드에 맞는 안내로 바꿔서 throw해요", async () => {
		fetchMock.mockResolvedValueOnce(new Response("", { status: 401 }));
		await expect(putAssetObject("guild/a.png", PNG_BYTES)).rejects.toThrow(
			"이미지 저장소 인증에 실패했어요. 관리자에게 문의해 주세요.",
		);
	});
});

describe("deleteAssetObject", () => {
	it("404는 이미 없는 파일이라 성공으로 처리해요", async () => {
		fetchMock.mockResolvedValueOnce(new Response("", { status: 404 }));
		await expect(deleteAssetObject("assets", "guild/a.png")).resolves.toBeUndefined();
	});

	it("그 외 실패는 한국어 사유를 throw해요", async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse({ error: "삭제하지 못했어요." }, 500));
		await expect(deleteAssetObject("assets", "guild/a.png")).rejects.toThrow("삭제하지 못했어요.");
	});
});
