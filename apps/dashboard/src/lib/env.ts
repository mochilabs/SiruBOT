import { z } from "zod";

// Parsed on each call (not at module load) so runtime env changes in tests take effect immediately.
const dataApiEnvSchema = z
  .object({
    DATA_API_URL: z.string().default("http://localhost:3002"),
    DATA_API_AUTH_KEY: z.string().optional(),
    AUTH_KEY: z.string().optional(),
  })
  .transform((env) => ({
    url: env.DATA_API_URL,
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

export function getDataApiEnv(): { url: string; authKey: string } {
  return dataApiEnvSchema.parse(process.env);
}

export function getStorageEnv(): { url: string; authKey: string } {
  return storageEnvSchema.parse(process.env);
}

export function getShardManagerEnv(): { url: string; authKey: string | undefined } {
  return shardManagerEnvSchema.parse(process.env);
}

export function getVoiceServerStatsUrl(): string {
  return voiceServerEnvSchema.parse(process.env).LAVALINK_STATS_URL;
}

export function getDashboardAdminIdsRaw(): string {
  return (adminIdsEnvSchema.parse(process.env).DASHBOARD_ADMIN_IDS ?? "").trim();
}

export function getRedisUrl(): string | undefined {
  return redisEnvSchema.parse(process.env).REDIS_URL;
}

export function getDatabaseUrl(): string | undefined {
  return databaseEnvSchema.parse(process.env).DATABASE_URL;
}

export function getSessionSecret(): string | undefined {
  return sessionSecretEnvSchema.parse(process.env);
}

export function getDiscordOAuthEnv(): { clientId: string | undefined; clientSecret: string | undefined } {
  const env = discordOAuthEnvSchema.parse(process.env);
  return { clientId: env.DISCORD_CLIENT_ID, clientSecret: env.DISCORD_CLIENT_SECRET };
}
