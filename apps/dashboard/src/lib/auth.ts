import NextAuth from "next-auth";
import DiscordProvider from "next-auth/providers/discord";

import { refreshDiscordToken } from "./discord-token";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    DiscordProvider({
      clientId: process.env.AUTH_DISCORD_ID,
      clientSecret: process.env.AUTH_DISCORD_SECRET,
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
      // 로그인/재로그인 — 받은 토큰으로 새로 시작해요.
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.id = account.providerAccountId;
        // expires_in 604800초 = 7일 (Discord 기본)
        token.accessTokenExpires = Date.now() + (account.expires_in ?? 604800) * 1000;
        delete token.refreshRetryAt;
        return token;
      }

      // 아직 충분히 유효하면 그대로 써요 (만료 10분 전부터 갱신 시도).
      const expires = typeof token.accessTokenExpires === "number" ? token.accessTokenExpires : 0;
      if (Date.now() < expires - 10 * 60 * 1000) return token;

      // refreshToken이 없으면 갱신 불가 — accessToken도 지워 "재로그인 필요"로 정직하게 안내해요.
      if (!token.refreshToken) {
        delete token.accessToken;
        delete token.accessTokenExpires;
        return token;
      }

      // 일시적 실패(네트워크/429/5xx) 후의 재시도 쿨다운 — 토큰은 유지한 채 핫루프만 막아요.
      if (typeof token.refreshRetryAt === "number" && Date.now() < token.refreshRetryAt) {
        return token;
      }

      const result = await refreshDiscordToken(token.refreshToken);

      if (result.status === "ok") {
        token.accessToken = result.token.access_token;
        token.refreshToken = result.token.refresh_token ?? token.refreshToken;
        token.accessTokenExpires = Date.now() + (result.token.expires_in ?? 604800) * 1000;
        delete token.refreshRetryAt;
        return token;
      }

      if (result.status === "unavailable") {
        // 일시 장애 — 토큰을 버리지 않고 쿨다운 뒤 다시 시도해요.
        token.refreshRetryAt = Date.now() + 60 * 1000;
        return token;
      }

      // invalid — refreshToken이 죽었어요. 죽은 accessToken을 남기면 "세션은 살아있는데
      // 모든 API가 401"인 좀비가 되므로 함께 제거해, 로그인 페이지에서 재인증하도록 유도해요.
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
