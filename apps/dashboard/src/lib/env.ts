import { z } from "zod";

/**
 * 대시보드 서버 전용 env — zod 스키마 단일 원본 (apps/data-api·notifier의 src/config/env.ts와 같은 방향).
 *
 * 계약:
 * - 서버 전용 컨텍스트예요 — Route Handler/서버 유틸에서만 임포트하세요. NEXT_PUBLIC_*는 여기서 다루지 않아요
 *   (그건 빌드 시 클라이언트 번들에 인라인되는 별도 계약이라, layout/footer 등에서 그대로 읽어요).
 * - 각 accessor는 호출 시점에 process.env를 다시 파싱해요 — admin-ids·token-store 테스트가 런타임에 env를
 *   바꾸고 즉시 반영을 기대하는 계약이에요. 모듈 로드 시 스냅샷이 아니에요.
 * - 대시보드는 fail-open 설계예요 (키 미설정 → 호출 스킵/null). 여기서 키를 필수로 만들지 않아요 —
 *   fail-closed는 data-api·storage·notifier 앱 쪽 계약이에요.
 */

const dataApiEnvSchema = z
  .object({
    DATA_API_URL: z.string().default("http://localhost:3002"),
    DATA_API_AUTH_KEY: z.string().optional(),
    AUTH_KEY: z.string().optional(),
  })
  .transform((env) => ({
    url: env.DATA_API_URL,
    // data-api 계약: 둘 중 하나만 있어도 동작. || 이라서 빈 문자열도 폴백해요 (기존 lib/data-api.ts와 동일).
    authKey: (env.DATA_API_AUTH_KEY || env.AUTH_KEY || "").trim(),
  }));

const storageEnvSchema = z
  .object({
    STORAGE_URL: z.string().default("http://localhost:3003"),
    STORAGE_AUTH_KEY: z.string().optional(),
    AUTH_KEY: z.string().optional(),
  })
  .transform((env) => ({
    url: env.STORAGE_URL,
    authKey: (env.STORAGE_AUTH_KEY || env.AUTH_KEY || "").trim(),
  }));

const shardManagerEnvSchema = z
  .object({
    SHARD_MANAGER_URL: z.string().default("http://localhost:3001"),
    SHARD_MANAGER_AUTH_KEY: z.string().optional(),
  })
  .transform((env) => ({
    url: env.SHARD_MANAGER_URL,
    // 폴백 없음 — 미설정 시 shard-api가 throw 해요 (기존 getShardManagerAuthKey와 동일).
    authKey: env.SHARD_MANAGER_AUTH_KEY,
  }));

const voiceServerEnvSchema = z.object({
  LAVALINK_STATS_URL: z.string().default("https://lavalink.siru.life"),
});

const adminIdsEnvSchema = z.object({
  DASHBOARD_ADMIN_IDS: z.string().optional(),
});

const redisEnvSchema = z.object({
  REDIS_URL: z.string().optional(),
});

const databaseEnvSchema = z.object({
  DATABASE_URL: z.string().optional(),
});

/** next-auth JWT 암호화 시크릿 — AUTH_SECRET 우선, NEXTAUTH_SECRET 폴백 (|| 이 아니라 ?? — 기존과 동일). */
const sessionSecretEnvSchema = z
  .object({
    AUTH_SECRET: z.string().optional(),
    NEXTAUTH_SECRET: z.string().optional(),
  })
  .transform((env) => env.AUTH_SECRET ?? env.NEXTAUTH_SECRET);

const discordOAuthEnvSchema = z.object({
  DISCORD_CLIENT_ID: z.string().optional(),
  DISCORD_CLIENT_SECRET: z.string().optional(),
});

/** data-api 게이트웨이 주소·인증 키 (미설정 시 인증 키는 빈 문자열 — 호출부가 스킵을 결정해요). */
export function getDataApiEnv(): { url: string; authKey: string } {
  return dataApiEnvSchema.parse(process.env);
}

/** 이미지 저장소(storage) 주소·인증 키. */
export function getStorageEnv(): { url: string; authKey: string } {
  return storageEnvSchema.parse(process.env);
}

/** 샤드매니저 주소·인증 키 (인증 키는 폴백 없이 원문 그대로). */
export function getShardManagerEnv(): { url: string; authKey: string | undefined } {
  return shardManagerEnvSchema.parse(process.env);
}

/** 음성 서버(Lavalink) 통계 서버 주소. */
export function getVoiceServerStatsUrl(): string {
  return voiceServerEnvSchema.parse(process.env).LAVALINK_STATS_URL;
}

/** 운영자 allowlist 원문 (쉼표 구분, 공백만 있으면 빈 문자열) — 파싱·차단 정책은 lib/admin-ids.ts가 소유해요. */
export function getDashboardAdminIdsRaw(): string {
  return (adminIdsEnvSchema.parse(process.env).DASHBOARD_ADMIN_IDS ?? "").trim();
}

/** Redis URL (미설정이면 undefined — 메모리 폴백 모드). */
export function getRedisUrl(): string | undefined {
  return redisEnvSchema.parse(process.env).REDIS_URL;
}

/** PostgreSQL 연결 문자열 (미설정이면 undefined — Prisma가 첫 사용 시 실패해요). */
export function getDatabaseUrl(): string | undefined {
  return databaseEnvSchema.parse(process.env).DATABASE_URL;
}

/** next-auth 세션 시크릿 (AUTH_SECRET ?? NEXTAUTH_SECRET, 둘 다 없으면 undefined). */
export function getSessionSecret(): string | undefined {
  return sessionSecretEnvSchema.parse(process.env);
}

/** Discord OAuth 클라이언트 자격 (clientId/secret, 미설정이면 undefined). */
export function getDiscordOAuthEnv(): { clientId: string | undefined; clientSecret: string | undefined } {
  const env = discordOAuthEnvSchema.parse(process.env);
  return { clientId: env.DISCORD_CLIENT_ID, clientSecret: env.DISCORD_CLIENT_SECRET };
}
