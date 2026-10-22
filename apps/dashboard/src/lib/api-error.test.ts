// api-error 회귀 계약 — toApiError/toError의 메시지 폴백과 retryable(401/403 제외) 판정을 잠가요.
// 13개 컴포넌트의 오류 UI가 이 결과에 의존해요.
import { describe, expect, it } from "vitest";

import { ApiError, toApiError, toError } from "./api-error";

function response(status: number, body?: unknown): Response {
	return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

describe("toApiError", () => {
	it("본문의 error 메시지를 우선 써요", async () => {
		const error = await toApiError(response(500, { error: "서버의 한국어 메시지" }), "폴백");
		expect(error.message).toBe("서버의 한국어 메시지");
		expect(error.status).toBe(500);
	});

	it("본문이 없으면(또는 JSON이 아니면) 폴백 메시지를 써요", async () => {
		expect((await toApiError(response(500), "폴백")).message).toBe("폴백");
		const notJson = new Response("oops", { status: 500 });
		expect((await toApiError(notJson, "폴백")).message).toBe("폴백");
	});

	it("빈 문자열 error는 폴백으로 떨어뜨려요", async () => {
		const error = await toApiError(response(500, { error: "   " }), "폴백");
		expect(error.message).toBe("폴백");
	});

	it("401/403은 재시도 불가, 그 외 상태는 재시도 가능이에요", async () => {
		expect((await toApiError(response(401), "f")).retryable).toBe(false);
		expect((await toApiError(response(403), "f")).retryable).toBe(false);
		expect((await toApiError(response(500), "f")).retryable).toBe(true);
		expect((await toApiError(response(429), "f")).retryable).toBe(true);
		expect((await toApiError(response(502), "f")).retryable).toBe(true);
	});
});

describe("toError", () => {
	it("이미 ApiError면 그대로 돌려줘요 (재시도 판정 보존)", () => {
		const original = new ApiError("메시지", false, 403);
		expect(toError(original, "폴백")).toBe(original);
	});

	it("일반 Error는 폴백 메시지의 재시도 가능 ApiError로 감싸요", () => {
		const wrapped = toError(new Error("network"), "폴백");
		expect(wrapped).toBeInstanceOf(ApiError);
		expect(wrapped.message).toBe("폴백");
		expect(wrapped.retryable).toBe(true);
		expect(wrapped.status).toBeUndefined();
	});

	it("throw된 비 Error 값도 감싸요", () => {
		const wrapped = toError("문자열 에러", "폴백");
		expect(wrapped.message).toBe("폴백");
		expect(wrapped.retryable).toBe(true);
	});
});
