import { NextResponse } from "next/server";

import { isRedisEnabled, redisEval } from "@/lib/redis";

export interface RateRule {
  limit: number;
  windowMs: number;
}

export const WRITE_RATE: RateRule = { limit: 12, windowMs: 60_000 };
export const READ_RATE: RateRule = { limit: 30, windowMs: 60_000 };
export const HEAVY_WRITE_RATE: RateRule = { limit: 5, windowMs: 60_000 };
export const UPLOAD_RATE: RateRule = { limit: 10, windowMs: 60_000 };
export const PUBLIC_RATE: RateRule = { limit: 120, windowMs: 60_000 };

// Re-seed math.random per call: Redis < 7 fixes the PRNG seed per Lua script execution.
const SLIDING_WINDOW_SCRIPT = `
  local time = redis.call('TIME')
  local now = time[1] * 1000 + math.floor(time[2] / 1000)
  local windowMs = tonumber(ARGV[1])
  local limit = tonumber(ARGV[2])

  redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - windowMs)
  local count = redis.call('ZCARD', KEYS[1])

  if count >= limit then
    local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
    return {0, tonumber(oldest[2]) + windowMs - now}
  end

  math.randomseed(time[1] * 1000000 + time[2])
  local member = tostring(now) .. ':' .. tostring(math.random(0, 999999))
  redis.call('ZADD', KEYS[1], now, member)
  redis.call('PEXPIRE', KEYS[1], windowMs)
  return {1, 0}
`;

const buckets = new Map<string, number[]>();
const MAX_BUCKETS = 10_000;

let warnedRedisFailure = false;

function rateLimit(
  key: string,
  rule: RateRule,
): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter(
    (at) => now - at < rule.windowMs,
  );

  if (hits.length >= rule.limit) {
    buckets.set(key, hits);
    return { ok: false, retryAfterMs: rule.windowMs - (now - hits[0]) + 1 };
  }

  hits.push(now);
  buckets.set(key, hits);

  if (buckets.size > MAX_BUCKETS) {
    for (const [bucketKey, timestamps] of buckets) {
      if (timestamps.every((at) => now - at >= rule.windowMs))
        buckets.delete(bucketKey);
      if (buckets.size <= MAX_BUCKETS) break;
    }
  }

  return { ok: true, retryAfterMs: 0 };
}

export function rateKey(...parts: (string | null | undefined)[]): string {
  return parts.map((part) => part ?? "-").join(":");
}

// Intentionally ignores request headers (e.g. X-Forwarded-For) to prevent bucket spoofing.
export function publicReadLimit(
  userId: string | undefined,
): { subject: string; rule: RateRule } {
  return userId
    ? { subject: userId, rule: READ_RATE }
    : { subject: "anonymous", rule: PUBLIC_RATE };
}

export async function guardRateLimit(
  key: string,
  rule: RateRule,
): Promise<NextResponse | null> {
  if (!isRedisEnabled()) {
    return rateLimitResponse(rateLimit(key, rule));
  }

  const result = await redisEval<number[]>(SLIDING_WINDOW_SCRIPT, [key], [
    rule.windowMs,
    rule.limit,
  ]);

  if (result === null) {
    if (!warnedRedisFailure) {
      warnedRedisFailure = true;
      console.warn(
        "[rate-limit] Redis 분산 윈도우 실행 실패 — 한도 미적용(fail-open)으로 동작해요.",
      );
    }
    return null;
  }

  return rateLimitResponse({
    ok: result[0] === 1,
    retryAfterMs: result[1] ?? 0,
  });
}

function rateLimitResponse(
  result: { ok: boolean; retryAfterMs: number },
): NextResponse | null {
  if (result.ok) return null;
  return NextResponse.json(
    { error: "너무 잦은 요청이에요. 잠시 후 다시 시도해 주세요." },
    {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)) },
    },
  );
}
