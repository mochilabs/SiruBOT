import { describe, expect, it } from 'vitest';
import { resolveRedisSigningKey, unwrapRedisMessage, wrapRedisMessage } from './redisEnvelope.ts';

const KEY = 'test-redis-signing-key';
const PAYLOAD = { requestId: 'ecbbfba6-987c-46fa-b7b2-49f517db1c1e', guildId: 'guild-1', userId: 'user-1', kind: 'voice-context' };

describe('redisEnvelope — 서비스 간 메시지 서명 (SEC-006)', () => {
	it('서명한 메시지는 같은 키로 원본을 되돌려 받아요', () => {
		const raw = wrapRedisMessage(KEY, PAYLOAD);
		expect(JSON.parse(raw)).toHaveProperty('sig');
		const body = unwrapRedisMessage(KEY, raw);
		expect(body).toBe(JSON.stringify(PAYLOAD));
	});

	it('본문이 변조되면 거부해요', () => {
		const raw = wrapRedisMessage(KEY, PAYLOAD);
		const envelope = JSON.parse(raw) as { body: string; sig: string };
		const tampered = JSON.stringify({ body: JSON.stringify({ ...PAYLOAD, userId: 'attacker' }), sig: envelope.sig });
		expect(unwrapRedisMessage(KEY, tampered)).toBeNull();
	});

	it('다른 키로는 검증할 수 없어요', () => {
		const raw = wrapRedisMessage(KEY, PAYLOAD);
		expect(unwrapRedisMessage('other-key', raw)).toBeNull();
	});

	it('키가 있을 때 서명 없는 메시지는 거부해요 (fail-closed)', () => {
		expect(unwrapRedisMessage(KEY, JSON.stringify(PAYLOAD))).toBeNull();
		expect(unwrapRedisMessage(KEY, 'not json at all')).toBeNull();
		expect(unwrapRedisMessage(KEY, JSON.stringify({ body: 1, sig: 'x' }))).toBeNull();
	});

	it('키가 없으면 구버전 모드 — 서명 없이 주고받아요', () => {
		expect(wrapRedisMessage('', PAYLOAD)).toBe(JSON.stringify(PAYLOAD));
		expect(unwrapRedisMessage('', JSON.stringify(PAYLOAD))).toBe(JSON.stringify(PAYLOAD));
	});
});

describe('resolveRedisSigningKey', () => {
	it('REDIS_AUTH_KEY를 우선하고, 없으면 AUTH_KEY로 폴백해요', () => {
		expect(resolveRedisSigningKey({ REDIS_AUTH_KEY: 'redis-key', AUTH_KEY: 'auth-key' })).toBe('redis-key');
		expect(resolveRedisSigningKey({ AUTH_KEY: 'auth-key' })).toBe('auth-key');
		expect(resolveRedisSigningKey({ REDIS_AUTH_KEY: '  ', AUTH_KEY: 'auth-key' })).toBe('auth-key');
		expect(resolveRedisSigningKey({})).toBe('');
	});
});
