import NextAuth from "next-auth";
import DiscordProvider from "next-auth/providers/discord";

import { isDashboardAdmin } from "@/lib/admin-ids";
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
      if (account) {
        const expiresIn = account.expires_in ?? 604800;
        const accessToken = account.access_token;
        token.id = account.providerAccountId;
        token.accessToken = accessToken;
        token.accessTokenExpires = Date.now() + expiresIn * 1000;
        if (accessToken) {
          await replaceTokenSet(account.providerAccountId, {
            accessToken,
            refreshToken: account.refresh_token ?? "",
            expiresAtMs: Date.now() + expiresIn * 1000,
          });
        }
        delete token.refreshToken;
        delete token.refreshRetryAt;
        return token;
      }

      const expires = typeof token.accessTokenExpires === "number" ? token.accessTokenExpires : 0;
      if (Date.now() < expires - 10 * 60 * 1000) return token;

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
        delete token.refreshToken;
        delete token.refreshRetryAt;
        return token;
      }
      if (result.status === "unavailable") {
        token.refreshRetryAt = Date.now() + 60 * 1000;
        return token;
      }
      delete token.refreshToken;
      delete token.accessToken;
      delete token.accessTokenExpires;
      delete token.refreshRetryAt;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const userId = token.id as string;
        session.user.id = userId;
        session.user.isAdmin = isDashboardAdmin(userId);
      }
      return session;
    },
  },
});
