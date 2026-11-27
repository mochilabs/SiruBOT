import { isRedisEnabled, redisGet, redisSet } from "@/lib/redis";

const MANAGE_GUILD = BigInt(0x20);
const ADMINISTRATOR = BigInt(0x8);

export function hasManageablePermissions(
  permissions: string | number | bigint,
): boolean {
  try {
    const bits = BigInt(permissions);
    return (
      (bits & MANAGE_GUILD) === MANAGE_GUILD ||
      (bits & ADMINISTRATOR) === ADMINISTRATOR
    );
  } catch {
    return false;
  }
}

export type CanManageResult =
  | { status: "ok"; manageable: boolean }
  | { status: "unavailable" }
  | { status: "invalid-token" };

const OK_CACHE_TTL_MS = 60_000;
const UNAVAILABLE_CACHE_TTL_MS = 10_000;
const CACHE_MAX_ENTRIES = 1_000;
const DISCORD_TIMEOUT_MS = 8_000;

const resolveCache = new Map<
  string,
  { expires: number; result: CanManageResult; meta: GuildMeta | null }
>();

// Coalesce concurrent /users/@me/guilds calls per user:guild to avoid 429s.
const inflight = new Map<string, Promise<{ result: CanManageResult; meta: GuildMeta | null }>>();

function readEntry(cacheKey: string): { expires: number; result: CanManageResult; meta: GuildMeta | null } | null {
  const cached = resolveCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expires <= Date.now()) {
    resolveCache.delete(cacheKey);
    return null;
  }
  return cached;
}

function writeCache(cacheKey: string, result: CanManageResult, meta: GuildMeta | null): void {
  const ttl = cacheTtlMs(result);
  if (ttl === 0) return;

  if (resolveCache.size >= CACHE_MAX_ENTRIES) {
    const now = Date.now();
    for (const [key, entry] of resolveCache) {
      if (entry.expires <= now) {
        resolveCache.delete(key);
      }
      if (resolveCache.size >= CACHE_MAX_ENTRIES) break;
    }
  }
  resolveCache.set(cacheKey, { expires: Date.now() + ttl, result, meta });
}

function redisKey(userId: string, guildId: string): string {
  return `guild-perm:${userId}:${guildId}`;
}

function cacheTtlMs(result: CanManageResult): number {
  return result.status === "ok"
    ? OK_CACHE_TTL_MS
    : result.status === "unavailable"
      ? UNAVAILABLE_CACHE_TTL_MS
      : 0;
}

async function readRedisCache(
  userId: string,
  guildId: string,
): Promise<{ result: CanManageResult; meta: GuildMeta | null } | null> {
  if (!isRedisEnabled()) return null;
  let raw: string | null;
  try {
    raw = await redisGet(redisKey(userId, guildId));
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as { result: CanManageResult; meta: GuildMeta | null };
    return parsed;
  } catch {
    return null;
  }
}

async function writeRedisCache(
  userId: string,
  guildId: string,
  result: CanManageResult,
  meta: GuildMeta | null,
): Promise<void> {
  const ttl = cacheTtlMs(result);
  if (ttl === 0 || !isRedisEnabled()) return;
  try {
    await redisSet(redisKey(userId, guildId), JSON.stringify({ result, meta }), ttl);
  } catch {
  }
}

export interface GuildMeta {
  name: string;
  icon: string | null;
}

async function fetchGuildsOnce(
  accessToken: string,
  guildId: string,
): Promise<{
  result: CanManageResult;
  retryable: boolean;
  meta: GuildMeta | null;
}> {
  try {
    const res = await fetch("https://discord.com/api/v10/users/@me/guilds", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(DISCORD_TIMEOUT_MS),
    });
    if (res.status === 401) {
      return { result: { status: "invalid-token" }, retryable: false, meta: null };
    }
    if (res.status === 429) {
      return { result: { status: "unavailable" }, retryable: false, meta: null };
    }
    if (res.status >= 500) {
      return { result: { status: "unavailable" }, retryable: true, meta: null };
    }
    if (!res.ok) {
      return { result: { status: "ok", manageable: false }, retryable: false, meta: null };
    }
    const guilds: Array<{ id: string; name?: string; icon?: string | null; permissions: string | number }> =
      await res.json();
    const guild = Array.isArray(guilds) ? guilds.find((g) => g.id === guildId) : undefined;
    return {
      result: {
        status: "ok",
        manageable: guild !== undefined
          ? hasManageablePermissions(guild.permissions)
          : false,
      },
      retryable: false,
      meta:
        guild !== undefined
          ? { name: guild.name ?? "", icon: guild.icon ?? null }
          : null,
    };
  } catch {
    return { result: { status: "unavailable" }, retryable: true, meta: null };
  }
}

export async function resolveCanManage(
  accessToken: string,
  userId: string,
  guildId: string,
): Promise<CanManageResult> {
  return (await resolveGuildsInfo(accessToken, userId, guildId)).result;
}

export type GuildMembershipResult =
  | { status: "ok"; isMember: boolean }
  | { status: "unavailable" }
  | { status: "invalid-token" };

export async function resolveGuildMembership(
  accessToken: string,
  userId: string,
  guildId: string,
): Promise<GuildMembershipResult> {
  const { result, meta } = await resolveGuildsInfo(accessToken, userId, guildId);
  if (result.status === "unavailable" || result.status === "invalid-token") {
    return { status: result.status };
  }
  return { status: "ok", isMember: meta !== null };
}

async function resolveGuildsInfo(
  accessToken: string,
  userId: string,
  guildId: string,
): Promise<{ result: CanManageResult; meta: GuildMeta | null }> {
  const cacheKey = `${userId}:${guildId}`;
  const cached = readEntry(cacheKey);
  if (cached) return { result: cached.result, meta: cached.meta };

  const redisCached = await readRedisCache(userId, guildId);
  if (redisCached) return redisCached;

  const existing = inflight.get(cacheKey);
  if (existing) return existing;

  const pending = (async (): Promise<{ result: CanManageResult; meta: GuildMeta | null }> => {
    const first = await fetchGuildsOnce(accessToken, guildId);
    let attempt = first;
    if (first.retryable) {
      attempt = await fetchGuildsOnce(accessToken, guildId);
    }
    writeCache(cacheKey, attempt.result, attempt.meta);
    await writeRedisCache(userId, guildId, attempt.result, attempt.meta);
    return { result: attempt.result, meta: attempt.meta };
  })().finally(() => {
    if (inflight.get(cacheKey) === pending) inflight.delete(cacheKey);
  });

  inflight.set(cacheKey, pending);
  return pending;
}

export async function resolveGuildMeta(
  accessToken: string,
  userId: string,
  guildId: string,
): Promise<GuildMeta | null> {
  return (await resolveGuildsInfo(accessToken, userId, guildId)).meta;
}
