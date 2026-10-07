import { headers } from "next/headers";
import { getToken } from "next-auth/jwt";

/**
 * 서버(Route Handler/Server Component) 전용 — 현재 요청의 JWT에서 Discord accessToken을 읽어요.
 * accessToken은 session 콜백에서 노출하지 않으므로(클라이언트 유출 방지),
 * 토큰이 필요한 Discord API 호출은 반드시 이 헬퍼로 서버에서만 꺼내 쓰세요.
 *
 * next-auth v5는 JWT 암호화 salt로 세션 쿠키 이름을 써요 — 요청 프로토콜에 따라
 * `__Secure-authjs.session-token`(HTTPS) 또는 `authjs.session-token`(HTTP)이 되므로 둘 다 시도해요.
 */
const SESSION_COOKIE_NAMES = [
  "__Secure-authjs.session-token",
  "authjs.session-token",
] as const;

export async function getSessionAccessToken(): Promise<string | null> {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) return null;

  const reqHeaders = await headers();
  for (const cookieName of SESSION_COOKIE_NAMES) {
    const token = await getToken({
      req: { headers: reqHeaders },
      cookieName,
      secret,
    });
    const accessToken = token?.accessToken;
    if (typeof accessToken === "string" && accessToken.length > 0)
      return accessToken;
  }
  return null;
}
