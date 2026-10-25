import NextAuth from "next-auth";
import DiscordProvider from "next-auth/providers/discord";

import { getDiscordOAuthEnv } from "@/lib/env";

import { ensureFreshToken, replaceTokenSet } from "./token-store";

export const { handlers, auth, signIn } = NextAuth({
  providers: [
    DiscordProvider({
      clientId: getDiscordOAuthEnv().clientId,
      clientSecret: getDiscordOAuthEnv().clientSecret,
      // Discord가 토큰/ID 토큰 응답에 iss를 보내기 시작해 auth.js의 issuer 검증이 필요함
      // (미설정 시 콜백에서 unexpected "iss" → Configuration 에러. next-auth#12687)
      issuer: "https://discord.com",
      authorization: {
        params: { scope: "identify guilds" },
      },
    }),
  ],
  pages: {
    signIn: "/login",
    error: "/error",
  },
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60,
  },
  callbacks: {
    async jwt({ token, account }) {
      // 로그인/재로그인 — 받은 토큰으로 DB 원본을 갱신하고 JWT엔 미러만 남겨요.
      if (account) {
        const expiresIn = account.expires_in ?? 604800;
        const accessToken = account.access_token;
        token.id = account.providerAccountId;
        token.accessToken = accessToken;
        token.accessTokenExpires = Date.now() + expiresIn * 1000;
        // 로그인 = DB 원본 갱신. access_token은 항상 오므로, 없을 때만 DB 기록을 건너뛰어요.
        if (accessToken) {
          await replaceTokenSet(account.providerAccountId, {
            accessToken,
            refreshToken: account.refresh_token ?? "",
            expiresAtMs: Date.now() + expiresIn * 1000,
          });
        }
        delete token.refreshToken; // refreshToken은 JWT에 더 이상 안 둬요.
        delete token.refreshRetryAt;
        return token;
      }

      const expires = typeof token.accessTokenExpires === "number" ? token.accessTokenExpires : 0;
      // 만료 10분 전까지는 빠른 경로 — DB/Redis 안 침.
      if (Date.now() < expires - 10 * 60 * 1000) return token;

      // 일시 장애(429/5xx/네트워크) 후 60초 쿨다운 — 만료 임박해도 갱신을 핫루프로 재시도하지 않아요.
      if (typeof token.refreshRetryAt === "number" && Date.now() < token.refreshRetryAt) return token;

      const userId = token.id as string | undefined;
      if (!userId) {
        delete token.accessToken;
        delete token.accessTokenExpires;
        return token;
      }

      const legacy =
        typeof token.refreshToken === "string" && token.refreshToken
          ? { refreshToken: token.refreshToken, accessToken: token.accessToken as string, expiresAtMs: expires }
          : undefined;

      const result = await ensureFreshToken(userId, legacy);

      if (result.status === "ok") {
        token.accessToken = result.accessToken;
        token.accessTokenExpires = result.expiresAtMs;
        delete token.refreshToken; // 성공 후에도 JWT에 refreshToken 안 남겨요.
        delete token.refreshRetryAt;
        return token;
      }
      if (result.status === "unavailable") {
        // 일시 장애 — 토큰을 유지하고 쿨다운 뒤 다시 시도해요.
        token.refreshRetryAt = Date.now() + 60 * 1000;
        return token;
      }
      // invalid — 죽은 토큰 정리. 죽은 accessToken을 남기면 좀비 세션이 되므로 함께 제거해요.
      delete token.refreshToken;
      delete token.accessToken;
      delete token.accessTokenExpires;
      delete token.refreshRetryAt;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
