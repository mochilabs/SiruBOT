/**
 * data-api HTTP 프록시 클라이언트 — GET/POST/SSE/이미지 forward와 실패 응답 정리.
 * 서버 전용(env의 AUTH_KEY를 다뤄요). 클라이언트 번들로 절대 노출하지 않아요.
 */
import { NextResponse } from "next/server";

import type { DataApiForwardFail, DataApiForwardResult, DataApiImageResult, GuildSettingsInvalidateResult } from "./types";
import { getDataApiEnv } from "@/lib/env";

/**
 * data-api GET 프록시 — AUTH_KEY는 서버 전용(env). 클라이언트 번들로 절대 노출하지 않아요.
 * 키가 없으면(또는 공백뿐이면) 실패시키지 않고 null — 무인증 localhost 호출을 안 한다.
 */
export async function fetchDataApi<T>(path: string): Promise<T | null> {
  const { url, authKey } = getDataApiEnv();
  if (!authKey) {
    console.warn(
      "[data-api] DATA_API_AUTH_KEY/AUTH_KEY 미설정 — data-api 호출을 건너뛴다.",
    );
    return null;
  }

  try {
    const res = await fetch(`${url}${path}`, {
      cache: "no-store",
      headers: { Authorization: authKey },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * data-api SSE 스트림 프록시 — 인증 헤더를 붙여 upstream Response를 그대로 돌려준다.
 * 미설정이면 null (라우트에서 502 응답으로 변환).
 * SSE는 장기 연결이라 여기엔 AbortSignal.timeout을 걸지 않는다 — 타임아웃이 연결 전체를 잘라버리기 때문.
 */
export async function openDataApiStream(
  path: string,
): Promise<Response | null> {
  const { url, authKey } = getDataApiEnv();
  if (!authKey) return null;

  try {
    const upstream = await fetch(`${url}${path}`, {
      headers: { Authorization: authKey },
      cache: "no-store",
    });
    if (!upstream.ok || !upstream.body) return null;
    return upstream;
  } catch {
    return null;
  }
}

/**
 * data-api POST 프록시 (JSON) — AUTH_KEY는 서버 전용(env). 클라이언트 번들로 절대 노출하지 않아요.
 * 키가 없으면 실패시키지 않고 null. 네트워크/HTTP 오류도 null — 호출자가 실패 내성을 결정해요.
 */
export async function postDataApi<T>(
  path: string,
  body: unknown,
): Promise<T | null> {
  const { url, authKey } = getDataApiEnv();
  if (!authKey) return null;

  try {
    const res = await fetch(`${url}${path}`, {
      method: "POST",
      cache: "no-store",
      headers: { Authorization: authKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * data-api POST 프록시(JSON) — postDataApi와 달리 실패 상태와 본문 message를 파기하지 않아요.
 * 인사 카드 이미지 라우트처럼 data-api의 형식·용량 안내(400)를 사용자에게 그대로 보여줘야 하는 곳에서 써요.
 * LLM 호출처럼 응답이 오래 걸리는 엔드포인트는 timeoutMs를 넓혀요 (기본 10초).
 * method로 PATCH·DELETE도 보낼 수 있어요 — 본문이 없으면 body를 실어 보내지 않아요.
 */
export async function forwardDataApiPost<T>(
  path: string,
  body: unknown,
  options?: { timeoutMs?: number; method?: "POST" | "PATCH" | "DELETE" },
): Promise<DataApiForwardResult<T>> {
  const { url, authKey } = getDataApiEnv();
  if (!authKey) {
    console.warn(
      "[data-api] DATA_API_AUTH_KEY/AUTH_KEY 미설정 — data-api 호출을 건너뛴다.",
    );
    return { ok: false, status: 503, message: null };
  }
  try {
    const method = options?.method ?? "POST";
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const res = await fetch(`${url}${path}`, {
      method,
      cache: "no-store",
      headers:
        payload === undefined
          ? { Authorization: authKey }
          : { Authorization: authKey, "Content-Type": "application/json" },
      body: payload,
      signal: AbortSignal.timeout(options?.timeoutMs ?? 10_000),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as {
        message?: unknown;
      } | null;
      return {
        ok: false,
        status: res.status,
        message:
          typeof payload?.message === "string" && payload.message.trim()
            ? payload.message
            : null,
      };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, status: 502, message: null };
  }
}

/**
 * data-api GET 프록시 — forwardDataApiPost와 동일한 계약으로 실패 상태와 본문 message(한국어)를 파기하지 않아요.
 * 채널·역할 목록처럼 data-api의 실패 안내(502 봇 무응답·503 Redis 장애)를 사용자에게 그대로 보여줘야 하는 곳에서 써요.
 */
export async function forwardDataApiGet<T>(
  path: string,
): Promise<DataApiForwardResult<T>> {
  const { url, authKey } = getDataApiEnv();
  if (!authKey) {
    console.warn(
      "[data-api] DATA_API_AUTH_KEY/AUTH_KEY 미설정 — data-api 호출을 건너뛴다.",
    );
    return { ok: false, status: 503, message: null };
  }
  try {
    const res = await fetch(`${url}${path}`, {
      cache: "no-store",
      headers: { Authorization: authKey },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as {
        message?: unknown;
      } | null;
      return {
        ok: false,
        status: res.status,
        message:
          typeof payload?.message === "string" && payload.message.trim()
            ? payload.message
            : null,
      };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, status: 502, message: null };
  }
}

/**
 * forward* 실패를 대시보드 응답으로 정리 — 4xx는 data-api의 상태와 한국어 message를
 * 그대로 살리고, 5xx/네트워크(502)는 내성 있는 fallback으로 응답해요.
 */
export function dataApiFailResponse(
  fail: DataApiForwardFail,
  fallback: string,
): NextResponse {
  const status = fail.status < 500 ? fail.status : 502;
  return NextResponse.json({ error: fail.message ?? fallback }, { status });
}

/**
 * data-api POST 프록시(이미지) — PNG 등 binary 본문을 ArrayBuffer로 돌려줘요.
 * 응답이 image/*가 아니면 실패로 본다.
 */
export async function forwardDataApiImage(
  path: string,
  body: unknown,
): Promise<DataApiImageResult> {
  const { url, authKey } = getDataApiEnv();
  if (!authKey) {
    console.warn(
      "[data-api] DATA_API_AUTH_KEY/AUTH_KEY 미설정 — data-api 호출을 건너뛴다.",
    );
    return { ok: false, status: 503, message: null };
  }
  try {
    // 이미지 렌더는 data-api에서 최대 ~20초까지 걸릴 수 있어요 (봇 dataApiClient 기준) — 여유 있게 30초.
    const res = await fetch(`${url}${path}`, {
      method: "POST",
      cache: "no-store",
      headers: { Authorization: authKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as {
        message?: unknown;
      } | null;
      return {
        ok: false,
        status: res.status,
        message:
          typeof payload?.message === "string" && payload.message.trim()
            ? payload.message
            : null,
      };
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/"))
      return { ok: false, status: 502, message: null };
    return { ok: true, buffer: await res.arrayBuffer(), contentType };
  } catch {
    return { ok: false, status: 502, message: null };
  }
}

/**
 * 길드 설정 변경을 모든 봇 프로세스에 브로드캐스트 — 대시보드 PUT 성공 직후 호출해요.
 * data-api가 Redis 채널로 publish하고 각 봇이 자기 GuildService 캐시를 비워요.
 * 실패(null)여도 봇은 60초 TTL 폴백으로 결국 최신 설정을 읽으니 조용히 넘어가요.
 *
 * `reason: "mixer"` — 믹서(갭리스·크로스페이드) 저장이면 봇이 재생 중인 플레이어에
 * 설정을 바로 밀어 넣어요 (다음 곡까지 기다리지 않아요).
 */
export async function notifyGuildSettingsChanged(
  guildId: string,
  reason?: "mixer",
): Promise<boolean> {
  const result = await postDataApi<GuildSettingsInvalidateResult>(
    "/v1/internal/guild-settings/invalidate",
    reason ? { guildId, reason } : { guildId },
  );
  return result?.ok === true;
}
