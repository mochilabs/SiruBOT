import { createClient, type RedisClientType } from "@redis/client";
import { randomBytes } from "node:crypto";

import { getRedisUrl } from "@/lib/env";

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

function k(key: string): string {
	return KEY_PREFIX + key;
}

function getClient(): Promise<RedisClientType | null> {
	if (!isRedisEnabled()) return Promise.resolve(null);
	if (state.client?.isReady) return Promise.resolve(state.client);

	if (!state.connecting) {
		state.connecting = (async () => {
			const client = createClient({ url: getRedisUrl() }) as RedisClientType;
			client.on("error", () => {});
			try {
				await Promise.race([
					client.connect(),
					new Promise<null>((resolve) => setTimeout(() => resolve(null), CONNECT_TIMEOUT_MS)),
				]);
				if (client.isReady) {
					state.client = client;
					return client;
				}
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

export async function redisGet(key: string): Promise<string | null> {
	const client = await ready();
	if (!client) return null;
	try {
		return await client.get(k(key));
	} catch {
		return null;
	}
}

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

export async function redisEval<T>(script: string, keys: string[], args: (string | number)[]): Promise<T | null> {
	const client = await ready();
	if (!client) return null;
	try {
		return (await client.eval(script, { keys: keys.map(k), arguments: args.map(String) })) as unknown as T;
	} catch {
		return null;
	}
}

export function randomLockToken(): string {
	return randomBytes(16).toString("hex");
}
