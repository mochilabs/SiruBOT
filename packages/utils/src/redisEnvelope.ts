// Anyone with Redis access can publish, so senders sign with HMAC-SHA256 and receivers verify, blocking forged requests and replies.
// Envelope: `{ body, sig }` where `body` is the payload JSON kept as an opaque string, so re-serialization can't break the signature.
// Key: `REDIS_AUTH_KEY ?? AUTH_KEY`, shared by the bot and data-api. Without a key it runs unsigned (dev/standalone; production always has AUTH_KEY).
// A side that has a key rejects unsigned messages (fail-closed), so keys must match on both sides at deploy.
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Empty string means no signing. */
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

/** Null on a missing or mismatched signature or a malformed envelope. Without a key it returns the raw message unverified. */
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
