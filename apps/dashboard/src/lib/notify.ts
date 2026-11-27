"use client";

import { toast } from "@/components/ui/toast";
import { toError } from "@/lib/api-error";

const SAVED_APPLY_HINT = "봇이 곧 새 설정을 적용해요.";

export function notifyApiError(error: unknown, fallback: string): void {
	const apiError = toError(error, fallback);
	toast.error(apiError.message, apiError.retryable ? "잠시 후 다시 시도해 주세요." : undefined);
}

export function notifySaved(message: string, description: string | null = SAVED_APPLY_HINT): void {
	toast.success(message, description ?? undefined);
}
