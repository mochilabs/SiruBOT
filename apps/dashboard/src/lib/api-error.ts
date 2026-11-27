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
	}
	return new ApiError(message, res.status !== 401 && res.status !== 403, res.status);
}

export function toError(error: unknown, fallback: string): ApiError {
	return error instanceof ApiError ? error : new ApiError(fallback, true);
}
