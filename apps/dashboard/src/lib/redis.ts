import { createClient, type RedisClientType } from "@redis/client";
import { randomBytes } from "node:crypto";

import { getRedisUrl } from "@/lib/env";

/**
 * 대시보드 전용 Redis 연결 — rate-limit·guild 캐시·refresh 뮤텍스의 공용 기반.
 *
 * 원칙 (data-api hub 선례를 따른다):
 * - REDIS_URL 미설정 → 모든 헬퍼가 "사용 불가" sentinel(null/false)을 즉시 반환 (memory-only 모드).
 * - 연결 미준비/명령 오류 → 절대 throw하지 않고 "사용 불가"를 반환 (fail-open: 호출자가 폴백).
 * - 커넥션은 모듈 싱글턴 + globalThis로 Next.js HMR/재로드에도 한 번만 생성한다.
 * - 재연결은 @redis/client 내장 전략에 위임하고, 요청 경로는 isReady가 아니면 즉시 포기한다.
 */

const KEY_PREFIX = "sirubot:dashboard:";
const CONNECT_TIMEOUT_MS = 1_500;

type RedisState = {
	client: RedisClientType | null;
	connecting: Promise<RedisClientType | null> | null;
};

const globalStore = globalThis as unknown as { __sirubotDashboardRedis?: RedisState };

if (!globalStore.__sirubotDashboardRedis) {
	globalStore.__sirubotDashboardRedis = { client: null, connecting: null };
}
const state = globalStore.__sirubotDashboardRedis;

export function isRedisEnabled(): boolean {
	return Boolean(getRedisUrl());
}

/** 전체 키에 접두사를 붙여 봇·data-api와 격리한다. */
function k(key: string): string {
	return KEY_PREFIX + key;
}

function getClient(): Promise<RedisClientType | null> {
	if (!isRedisEnabled()) return Promise.resolve(null);
	if (state.client?.isReady) return Promise.resolve(state.client);

	if (!state.connecting) {
		state.connecting = (async () => {
			const client = createClient({ url: getRedisUrl() }) as RedisClientType;
			client.on("error", () => {
				/* 요청 경로를 죽이지 않는다 — 명령 단위 try/catch가 처리 */
			});
			try {
				await Promise.race([
					client.connect(),
					new Promise<null>((resolve) => setTimeout(() => resolve(null), CONNECT_TIMEOUT_MS)),
				]);
				if (client.isReady) {
					state.client = client;
					return client;
				}
				// 준비 전 타임아웃 → 이번 요청은 폴백, 연결은 백그라운드로 계속 시도
				return null;
			} catch {
				return null;
			} finally {
				state.connecting = null;
			}
		})();
	}
	return state.connecting;
}

async function ready(): Promise<RedisClientType | null> {
	try {
		return await getClient();
	} catch {
		return null;
	}
}

/** GET — 실패/미사용 시 null */
export async function redisGet(key: string): Promise<string | null> {
	const client = await ready();
	if (!client) return null;
	try {
		return await client.get(k(key));
	} catch {
		return null;
	}
}

/** SET (선택 TTL) — 성공 여부 반환 */
export async function redisSet(key: string, value: string, ttlMs?: number): Promise<boolean> {
	const client = await ready();
	if (!client) return false;
	try {
		if (ttlMs === undefined) {
			await client.set(k(key), value);
		} else {
			await client.set(k(key), value, { expiration: { type: "PX", value: ttlMs } });
		}
		return true;
	} catch {
		return false;
	}
}

/** SET NX PX — 뮤텍스 획득. 획득 성공 시 true */
export async function redisSetNx(key: string, value: string, ttlMs: number): Promise<boolean> {
	const client = await ready();
	if (!client) return false;
	try {
		const reply = await client.set(k(key), value, { NX: true, expiration: { type: "PX", value: ttlMs } });
		return reply === "OK";
	} catch {
		return false;
	}
}

/**
 * 소유자 검증 후 삭제 — 값이 일치할 때만 DEL (Redlock 안전 해제).
 * TTL이 먼저 만료돼 다른 요청이 재획득한 뮤텍스를 내가 지우지 않도록 보장한다.
 */
export async function redisCompareAndDel(key: string, expected: string): Promise<boolean> {
	const client = await ready();
	if (!client) return false;
	try {
		const reply = await client.eval(
			"if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
			{ keys: [k(key)], arguments: [expected] },
		);
		return Number(reply) === 1;
	} catch {
		return false;
	}
}

/** Lua 실행 — 실패/미사용 시 null */
export async function redisEval<T>(script: string, keys: string[], args: (string | number)[]): Promise<T | null> {
	const client = await ready();
	if (!client) return null;
	try {
		return (await client.eval(script, { keys: keys.map(k), arguments: args.map(String) })) as unknown as T;
	} catch {
		return null;
	}
}

/** 뮤텍스 값용 랜덤 토큰 */
export function randomLockToken(): string {
	return randomBytes(16).toString("hex");
}
