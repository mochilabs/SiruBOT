import NextAuth from "next-auth";
import DiscordProvider from "next-auth/providers/discord";

import { refreshDiscordToken } from "./discord-token";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    DiscordProvider({
      clientId: process.env.AUTH_DISCORD_ID,
      clientSecret: process.env.AUTH_DISCORD_SECRET,
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
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.id = account.providerAccountId;
        // expires_in 604800초 = 7일 (Discord 기본)
        token.accessTokenExpires = Date.now() + (account.expires_in ?? 604800) * 1000;
      }
      // 토큰 만료 임박(10분 전)이면 갱신 시도
      const expires = typeof token.accessTokenExpires === "number" ? token.accessTokenExpires : 0;
      if (Date.now() < expires - 10 * 60 * 1000) return token;
      if (!token.refreshToken) return token;
      const refreshed = await refreshDiscordToken(token.refreshToken);
      if (!refreshed) {
        // 갱신 실패 — refreshToken을 버려 재시도 핫루프를 막고, 라우트가 401 안내로 재로그인 UX를 유도해요
        delete token.refreshToken;
        return token;
      }
      token.accessToken = refreshed.access_token;
      token.refreshToken = refreshed.refresh_token ?? token.refreshToken;
      token.accessTokenExpires = Date.now() + refreshed.expires_in * 1000;
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
