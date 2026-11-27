// Reads fields off a caught value without assuming it is an Error: discord.js rejects with DiscordAPIError,
// fetch with DOMException, and tests with plain objects such as `{ code: 10008 }`.
function thrownField(error: unknown, key: 'code' | 'name' | 'message'): unknown {
	return typeof error === 'object' && error !== null ? (error as Record<string, unknown>)[key] : undefined;
}

export function thrownCode(error: unknown): unknown {
	return thrownField(error, 'code');
}

export function thrownName(error: unknown): unknown {
	return thrownField(error, 'name');
}

export function thrownMessage(error: unknown): unknown {
	return thrownField(error, 'message');
}
