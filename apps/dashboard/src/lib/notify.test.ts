// notify 회귀 계약 — ApiError의 서버 메시지 우선, 401/403 재시도 안내 제외, 저장 성공 부제 고정을 잠가요.
import { beforeEach, describe, expect, it, vi } from "vitest";

const toastMock = vi.hoisted(() => ({
	success: vi.fn(),
	error: vi.fn(),
}));

vi.mock("@/components/ui/toast", () => ({ toast: toastMock }));

import { ApiError } from "@/lib/api-error";
import { notifyApiError, notifySaved } from "@/lib/notify";

beforeEach(() => {
	toastMock.success.mockClear();
	toastMock.error.mockClear();
});

describe("notifyApiError", () => {
	it("ApiError면 서버 메시지를 그대로 보여주고 재시도 가능일 때만 재시도 안내를 덧붙여요", () => {
		notifyApiError(new ApiError("저장에 실패했어요.", true, 500), "폴백 메시지");
		expect(toastMock.error).toHaveBeenCalledWith("저장에 실패했어요.", "잠시 후 다시 시도해 주세요.");
	});

	it("401/403(retryable=false)은 재시도 안내를 붙이지 않아요", () => {
		notifyApiError(new ApiError("세션이 만료됐어요.", false, 401), "폴백 메시지");
		expect(toastMock.error).toHaveBeenCalledWith("세션이 만료됐어요.", undefined);
	});

	it("ApiError가 아니면 fallback 메시지를 써요", () => {
		notifyApiError(new Error("network down"), "저장에 실패했어요.");
		expect(toastMock.error).toHaveBeenCalledWith("저장에 실패했어요.", "잠시 후 다시 시도해 주세요.");
	});
});

describe("notifySaved", () => {
	it("부제를 안 주면 공용 적용 안내를 써요", () => {
		notifySaved("설정을 저장했어요.");
		expect(toastMock.success).toHaveBeenCalledWith("설정을 저장했어요.", "봇이 곧 새 설정을 적용해요.");
	});

	it("부제가 null이면 부제 없이 보내요", () => {
		notifySaved("설정을 저장했어요.", null);
		expect(toastMock.success).toHaveBeenCalledWith("설정을 저장했어요.", undefined);
	});
});
