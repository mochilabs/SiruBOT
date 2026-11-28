import { NextResponse } from "next/server";

import { getDataApiEnv } from "@/lib/env";

import type { DataApiForwardFail, DataApiForwardResult, DataApiImageResult, GuildSettingsInvalidateResult } from "./types";

function requireDataApi(): { url: string; authKey: string } | null {
  const env = getDataApiEnv();
  if (env.authKey) return env;
  console.warn(
    "[data-api] DATA_API_AUTH_KEY/AUTH_KEY 미설정 — data-api 호출을 건너뛴다.",
  );
  return null;
}

async function readForwardFail(res: Response): Promise<DataApiForwardFail> {
  const payload = (await res.json().catch(() => null)) as {
    message?: unknown;
    error?: unknown;
  } | null;
  return {
    ok: false,
    status: res.status,
    message:
      typeof payload?.message === "string" && payload.message.trim()
        ? payload.message
        : null,
    ...(typeof payload?.error === "string" ? { code: payload.error } : {}),
  };
}

export async function fetchDataApi<T>(path: string): Promise<T | null> {
  const env = requireDataApi();
  if (!env) return null;
  const { url, authKey } = env;

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

// Long-lived SSE stream: omit AbortSignal.timeout.
export async function openDataApiStream(
  path: string,
): Promise<Response | null> {
  const env = requireDataApi();
  if (!env) return null;
  const { url, authKey } = env;

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

export async function postDataApi<T>(
  path: string,
  body: unknown,
): Promise<T | null> {
  const env = requireDataApi();
  if (!env) return null;
  const { url, authKey } = env;

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

export async function forwardDataApiPost<T>(
  path: string,
  body: unknown,
  options?: { timeoutMs?: number; method?: "POST" | "PATCH" | "DELETE" },
): Promise<DataApiForwardResult<T>> {
  const env = requireDataApi();
  if (!env) return { ok: false, status: 503, message: null };
  const { url, authKey } = env;
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
    if (!res.ok) return readForwardFail(res);
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, status: 502, message: null };
  }
}

export async function forwardDataApiGet<T>(
  path: string,
): Promise<DataApiForwardResult<T>> {
  const env = requireDataApi();
  if (!env) return { ok: false, status: 503, message: null };
  const { url, authKey } = env;
  try {
    const res = await fetch(`${url}${path}`, {
      cache: "no-store",
      headers: { Authorization: authKey },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return readForwardFail(res);
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, status: 502, message: null };
  }
}

export function dataApiFailResponse(
  fail: DataApiForwardFail,
  fallback: string,
): NextResponse {
  const status = fail.status < 500 ? fail.status : 502;
  return NextResponse.json({ error: fail.message ?? fallback }, { status });
}

export function dataApiUserMessage(message: string | null, fallback: string | null): string | null {
  return message && /[가-힣]/.test(message) ? message : fallback;
}

export async function forwardDataApiImage(
  path: string,
  body: unknown,
): Promise<DataApiImageResult> {
  const env = requireDataApi();
  if (!env) return { ok: false, status: 503, message: null };
  const { url, authKey } = env;
  try {
    // Image rendering in data-api can take up to ~20s.
    const res = await fetch(`${url}${path}`, {
      method: "POST",
      cache: "no-store",
      headers: { Authorization: authKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return readForwardFail(res);
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/"))
      return { ok: false, status: 502, message: null };
    return { ok: true, buffer: await res.arrayBuffer(), contentType };
  } catch {
    return { ok: false, status: 502, message: null };
  }
}

export async function notifyGuildSettingsChanged(
  guildId: string,
  reason?: "mixer" | "panel",
): Promise<boolean> {
  const result = await postDataApi<GuildSettingsInvalidateResult>(
    "/v1/internal/guild-settings/invalidate",
    reason ? { guildId, reason } : { guildId },
  );
  return result?.ok === true;
}
