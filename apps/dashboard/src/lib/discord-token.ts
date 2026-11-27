import { getDiscordOAuthEnv } from "@/lib/env";

export interface DiscordTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

export type RefreshResult =
  | { status: "ok"; token: DiscordTokenResponse }
  | { status: "invalid" }
  | { status: "unavailable" };

// Must finish within the 12s mutex TTL in token-store.
const REFRESH_TIMEOUT_MS = 7_000;

export async function requestDiscordToken(refreshToken: string): Promise<RefreshResult> {
  try {
    const res = await fetch("https://discord.com/api/v10/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: getDiscordOAuthEnv().clientId ?? "",
        client_secret: getDiscordOAuthEnv().clientSecret ?? "",
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
    });

    if (res.status === 400 || res.status === 401 || res.status === 403) {
      return { status: "invalid" };
    }
    if (res.status === 429 || res.status >= 500) return { status: "unavailable" };
    if (!res.ok) return { status: "unavailable" };

    const token = (await res.json()) as DiscordTokenResponse;
    if (!token?.access_token) return { status: "unavailable" };
    return { status: "ok", token };
  } catch {
    return { status: "unavailable" };
  }
}
