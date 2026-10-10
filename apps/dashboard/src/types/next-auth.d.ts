import { type DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number; // epoch ms
    refreshRetryAt?: number; // 일시적 갱신 실패 후 재시도 쿨다운 (epoch ms)
    id?: string;
  }
}
