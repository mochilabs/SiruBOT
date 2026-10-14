// rate-limit 회귀 계약 — 인메모리 슬라이딩 윈도우 폴백과 Redis fail-open을 잠가요.
// 모듈 상태(buckets, warnedRedisFailure)가 테스트 간 섞이지 않게 고유 키를 써요.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/redis", () => ({
	isRedisEnabled: vi.fn(),
	redisEval: vi.fn(),
}));

import { isRedisEnabled, redisEval } from "@/lib/redis";

import { guardRateLimit, rateKey } from "./rate-limit";

let seq = 0;
const freshKey = (action: string) => `test:${action}:${++seq}`;

describe("guardRateLimit — 인메모리 슬라이딩 윈도우", () => {
	beforeEach(() => {
		vi.mocked(isRedisEnabled).mockReturnValue(false);
	});

	it("한도 이내 요청은 null(허용)을 돌려줘요", async () => {
		const key = freshKey("allow");
		const rule = { limit: 3, windowMs: 60_000 };
		expect(await guardRateLimit(key, rule)).toBeNull();
		expect(await guardRateLimit(key, rule)).toBeNull();
		expect(await guardRateLimit(key, rule)).toBeNull();
	});

	it("한도를 넘으면 429 + Retry-After로 차단해요", async () => {
		const key = freshKey("block");
		const rule = { limit: 2, windowMs: 60_000 };
		expect(await guardRateLimit(key, rule)).toBeNull();
		expect(await guardRateLimit(key, rule)).toBeNull();

		const blocked = await guardRateLimit(key, rule);
		expect(blocked).not.toBeNull();
		expect(blocked!.status).toBe(429);
		await expect(blocked!.json()).resolves.toEqual({
			error: "너무 잦은 요청이에요. 잠시 후 다시 시도해 주세요.",
		});
		expect(Number(blocked!.headers.get("Retry-After"))).toBeGreaterThanOrEqual(1);
	});

	it("윈도우가 지나면 같은 키를 다시 허용해요", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		try {
			const key = freshKey("window");
			const rule = { limit: 1, windowMs: 60_000 };
			expect(await guardRateLimit(key, rule)).toBeNull();
			expect(await guardRateLimit(key, rule)).not.toBeNull();

			vi.setSystemTime(Date.now() + 60_001);
			expect(await guardRateLimit(key, rule)).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it("키가 다르면 한도가 서로 격리돼요", async () => {
		const rule = { limit: 1, windowMs: 60_000 };
		expect(await guardRateLimit(freshKey("iso-a"), rule)).toBeNull();
		expect(await guardRateLimit(freshKey("iso-b"), rule)).toBeNull();
	});

	it("rateKey는 null/undefined 조각을 '-'으로 채워요", () => {
		expect(rateKey("a", undefined, "b", null)).toBe("a:-:b:-");
	});
});

describe("guardRateLimit — Redis 분산 윈도우", () => {
	beforeEach(() => {
		vi.mocked(isRedisEnabled).mockReturnValue(true);
	});

	it("Redis 결과가 허용(1)이면 null, 차단(0)이면 429를 돌려줘요", async () => {
		vi.mocked(redisEval).mockResolvedValue([1, 0]);
		expect(await guardRateLimit(freshKey("redis-ok"), { limit: 12, windowMs: 60_000 })).toBeNull();

		vi.mocked(redisEval).mockResolvedValue([0, 5_000]);
		const blocked = await guardRateLimit(freshKey("redis-block"), { limit: 12, windowMs: 60_000 });
		expect(blocked).not.toBeNull();
		expect(blocked!.status).toBe(429);
		expect(blocked!.headers.get("Retry-After")).toBe("5");
	});

	it("Redis 장애(null)는 fail-open으로 허용하고 경고는 최초 1회만 남겨요", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			vi.mocked(redisEval).mockResolvedValue(null);
			expect(await guardRateLimit(freshKey("fail-1"), { limit: 1, windowMs: 60_000 })).toBeNull();
			expect(await guardRateLimit(freshKey("fail-2"), { limit: 1, windowMs: 60_000 })).toBeNull();
			expect(warn).toHaveBeenCalledTimes(1);
		} finally {
			warn.mockRestore();
		}
	});
});