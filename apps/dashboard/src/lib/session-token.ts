import { headers } from "next/headers";
import { getToken } from "next-auth/jwt";

import { getSessionSecret } from "@/lib/env";

// next-auth v5 uses cookie name as JWT encryption salt; try both HTTPS and HTTP variants.
const SESSION_COOKIE_NAMES = [
  "__Secure-authjs.session-token",
  "authjs.session-token",
] as const;

export interface SessionTokenState {
  accessToken: string | null;
  expiresAt: number | null;
}

export async function getSessionTokenState(): Promise<SessionTokenState> {
  const secret = getSessionSecret();
  if (!secret) return { accessToken: null, expiresAt: null };

  const reqHeaders = await headers();
  for (const cookieName of SESSION_COOKIE_NAMES) {
    const token = await getToken({
      req: { headers: reqHeaders },
      cookieName,
      secret,
    });
    if (!token) continue;
    const accessToken = token.accessToken;
    if (typeof accessToken === "string" && accessToken.length > 0) {
      return {
        accessToken,
        expiresAt:
          typeof token.accessTokenExpires === "number"
            ? token.accessTokenExpires
            : null,
      };
    }
  }
  return { accessToken: null, expiresAt: null };
}

export async function getSessionAccessToken(): Promise<string | null> {
  return (await getSessionTokenState()).accessToken;
}
