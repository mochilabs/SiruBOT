import { NextResponse } from "next/server";

import { isRedisEnabled, redisEval } from "@/lib/redis";

interface RateRule {
  limit: number;
  windowMs: number;
}

/** 쓰기(설정 변경): 분당 12회 — 대시보드에서 체감되지 않는 여유 있는 한도 */
export const WRITE_RATE: RateRule = { limit: 12, windowMs: 60_000 };
/** 읽기(Discord 프록시): 분당 30회 */
export const READ_RATE: RateRule = { limit: 30, windowMs: 60_000 };
/** 무거운 쓰기(Discord 채널 생성): 분당 5회 */
export const HEAVY_WRITE_RATE: RateRule = { limit: 5, windowMs: 60_000 };
/** 이미지 미리보기 렌더: 분당 60회 — 드래그 편집이 400ms 디바운스로 잦은 재요청을 만들어요 */
export const RENDER_RATE: RateRule = { limit: 60, windowMs: 60_000 };

/**
 * Redis 분산 슬라이딩 윈도우.
 *
 * 서버 시각은 Lua 안에서 `TIME`으로 읽어요 — 인스턴스 간 클록 오차를 없애고
 * 다중 인스턴스 배포에서도 한도가 프로세스 수만큼 희석되지 않게 해요.
 * member는 now + 랜덤 접미로 동일 밀리초에 여러 요청이 와도 서로 덮어쓰지 않게 해요.
 * 반환은 `{ok, retryAfterMs}` 배열 (ok: 1=허용, 0=차단).
 */
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

  local member = tostring(now) .. ':' .. tostring(math.random(0, 999999))
  redis.call('ZADD', KEYS[1], now, member)
  redis.call('PEXPIRE', KEYS[1], windowMs)
  return {1, 0}
`;

const buckets = new Map<string, number[]>();
const MAX_BUCKETS = 10_000;

/** Redis 장애 시 fail-open 경고는 요청마다 찍지 않고 최초 1회만 남겨요. */
let warnedRedisFailure = false;

/** 인메모리 슬라이딩 윈도우. REDIS_URL 미설정(개발/standalone) 폴백이에요. */
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

/** 키 조립 — 사용자·길드·작업 단위로 격리해요. */
export function rateKey(...parts: (string | null | undefined)[]): string {
  return parts.map((part) => part ?? "-").join(":");
}

/** 한도 초과면 429 응답, 아니면 null. 라우트 진입점에서 바로 반환하세요. */
export async function guardRateLimit(
  key: string,
  rule: RateRule,
): Promise<NextResponse | null> {
  // REDIS_URL 미설정 → 기존 인메모리 윈도우로 폴백 (단일 프로세스 기준).
  if (!isRedisEnabled()) {
    return rateLimitResponse(rateLimit(key, rule));
  }

  const result = await redisEval<number[]>(SLIDING_WINDOW_SCRIPT, [key], [
    rule.windowMs,
    rule.limit,
  ]);

  // Redis가 켜져 있는데 장애(null) → 한도를 세지 않고 허용(fail-open).
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
