// HMAC-SHA256 signed { body, sig } envelope; fail-closed when signingKey is set.
import { createHmac, timingSafeEqual } from 'node:crypto';

export function resolveRedisSigningKey(env: Record<string, string | undefined>): string {
	const redisKey = (env.REDIS_AUTH_KEY ?? '').trim();
	if (redisKey) return redisKey;
	return (env.AUTH_KEY ?? '').trim();
}

export function wrapRedisMessage(signingKey: string, payload: unknown): string {
	const body = JSON.stringify(payload);
	if (!signingKey) return body;
	const sig = createHmac('sha256', signingKey).update(body).digest('hex');
	return JSON.stringify({ body, sig });
}

export function unwrapRedisMessage(signingKey: string, raw: string): string | null {
	if (!signingKey) return raw;
	let envelope: unknown;
	try {
		envelope = JSON.parse(raw);
	} catch {
		return null;
	}
	if (typeof envelope !== 'object' || envelope === null) return null;
	const { body, sig } = envelope as { body?: unknown; sig?: unknown };
	if (typeof body !== 'string' || typeof sig !== 'string') return null;
	const expected = Buffer.from(createHmac('sha256', signingKey).update(body).digest('hex'), 'utf8');
	const provided = Buffer.from(sig, 'utf8');
	if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
	return body;
}
