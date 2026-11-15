import type { z } from 'zod';
import { IsrcProviderError, type ProviderContext } from './types.js';

const MAX_RESPONSE_BYTES = 1024 * 1024;
const TIMEOUT_MS = 8_000;

async function readBounded(provider: string, response: Response): Promise<string> {
	const reader = response.body?.getReader();
	if (!reader) throw new IsrcProviderError(provider, 'response has no body');
	const chunks: Uint8Array[] = [];
	let total = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > MAX_RESPONSE_BYTES) {
			await reader.cancel();
			throw new IsrcProviderError(provider, 'response is too large');
		}
		chunks.push(value);
	}
	const result = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder().decode(result);
}

/** GET + 크기 상한 + zod 검증. 실패는 모두 IsrcProviderError예요. */
export async function getJson<T extends z.ZodType>(
	provider: string,
	url: URL,
	schema: T,
	ctx: ProviderContext,
	headers: Record<string, string> = {}
): Promise<z.infer<T>> {
	const signal = ctx.signal ? AbortSignal.any([ctx.signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS);
	let response: Response;
	try {
		response = await ctx.fetch(url, { signal, headers: { accept: 'application/json', ...headers } });
	} catch {
		throw new IsrcProviderError(provider, 'request failed');
	}
	if (!response.ok) throw new IsrcProviderError(provider, `HTTP ${response.status}`, response.status);
	let raw: unknown;
	try {
		raw = JSON.parse(await readBounded(provider, response));
	} catch (error) {
		if (error instanceof IsrcProviderError) throw error;
		throw new IsrcProviderError(provider, 'response could not be read');
	}
	const parsed = schema.safeParse(raw);
	if (!parsed.success) throw new IsrcProviderError(provider, 'invalid response');
	return parsed.data;
}
