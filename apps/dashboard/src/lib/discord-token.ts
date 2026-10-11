export interface DiscordTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

/**
 * Discord refresh 결과 3상태.
 * - ok: 새 토큰 발급 성공
 * - invalid: refreshToken 폐기/만료(400/401/403) — 재로그인 외 방법이 없어요
 * - unavailable: 네트워크·타임아웃·429·5xx — 일시적, 토큰을 버리지 않고 나중에 재시도해요
 */
export type RefreshResult =
  | { status: "ok"; token: DiscordTokenResponse }
  | { status: "invalid" }
  | { status: "unavailable" };

// 뮤텍스 TTL(12초) 안에 Discord 호출이 끝나야 하므로 넉넉히 여유를 둬요.
const REFRESH_TIMEOUT_MS = 7_000;

/**
 * Discord에 refreshToken을 직접 보내 새 토큰을 받아요.
 * 동시성·단일 비행·레이스 제어는 호출부(token-store)가 담당하고, 여기서는 raw 호출만 해요.
 */
export async function requestDiscordToken(refreshToken: string): Promise<RefreshResult> {
  try {
    const res = await fetch("https://discord.com/api/v10/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID ?? "",
        client_secret: process.env.DISCORD_CLIENT_SECRET ?? "",
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
    });

    // 이미 소비됐거나 폐기된 refreshToken — 재로그인만이 답이에요.
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      return { status: "invalid" };
    }
    // 레이트리밋/일시 장애 — refreshToken을 살려두고 쿨다운 후 재시도해요.
    if (res.status === 429 || res.status >= 500) return { status: "unavailable" };
    if (!res.ok) return { status: "unavailable" };

    const token = (await res.json()) as DiscordTokenResponse;
    if (!token?.access_token) return { status: "unavailable" };
    return { status: "ok", token };
  } catch {
    // 네트워크 오류/타임아웃 — 일시적으로 봐요.
    return { status: "unavailable" };
  }
}
