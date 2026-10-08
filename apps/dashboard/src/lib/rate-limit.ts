import { NextResponse } from "next/server";

/* ─────────────────────────── rate limit ─────────────────────────── */

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

const buckets = new Map<string, number[]>();
const MAX_BUCKETS = 10_000;

/** 인메모리 슬라이딩 윈도우. 단일 프로세스(standalone) 배포 기준이에요. */
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
export function guardRateLimit(
  key: string,
  rule: RateRule,
): NextResponse | null {
  const result = rateLimit(key, rule);
  if (result.ok) return null;
  return NextResponse.json(
    { error: "너무 잦은 요청이에요. 잠시 후 다시 시도해 주세요." },
    {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)) },
    },
  );
}
