/** API 오류 — 서버의 한국어 메시지를 그대로 보여주고 401/403(재시도 불가)을 구분해요 */
export class ApiError extends Error {
	constructor(
		message: string,
		readonly retryable: boolean,
		readonly status?: number,
	) {
		super(message);
	}
}

export async function toApiError(res: Response, fallback: string): Promise<ApiError> {
	let message = fallback;
	try {
		const body = (await res.json()) as { error?: unknown };
		if (typeof body.error === "string" && body.error.trim()) message = body.error;
	} catch {
		// JSON 본문이 없으면 기본 메시지 유지
	}
	return new ApiError(message, res.status !== 401 && res.status !== 403, res.status);
}

export function toError(error: unknown, fallback: string): ApiError {
	return error instanceof ApiError ? error : new ApiError(fallback, true);
}
