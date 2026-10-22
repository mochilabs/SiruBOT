"use client";

import { toast } from "@/components/ui/toast";
import { toError } from "@/lib/api-error";

/** 설정 저장 성공 토스트의 공용 부제 — 봇이 새 설정을 적용하는 방식을 한곳에서 안내해요 */
const SAVED_APPLY_HINT = "봇이 곧 새 설정을 적용해요.";

/**
 * 설정 저장·삭제 실패 토스트 — 서버의 한국어 메시지를 우선 보여주고,
 * 재시도 가능한 오류(401/403 제외)일 때만 재시도 안내를 덧붙여요.
 * 화면은 `notifyApiError(err, "저장에 실패했어요.")` 형태로 위임하세요.
 */
export function notifyApiError(error: unknown, fallback: string): void {
	const apiError = toError(error, fallback);
	toast.error(apiError.message, apiError.retryable ? "잠시 후 다시 시도해 주세요." : undefined);
}

/** 설정 저장 성공 토스트 — 부제는 공용 문구("봇이 곧 새 설정을 적용해요.")를 써요. null이면 부제 없음 */
export function notifySaved(message: string, description: string | null = SAVED_APPLY_HINT): void {
	toast.success(message, description ?? undefined);
}
