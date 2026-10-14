import { isRedisEnabled, redisGet, redisSet } from "@/lib/redis";

const MANAGE_GUILD = BigInt(0x20);
const ADMINISTRATOR = BigInt(0x8);

/** 길드 권한 비트에 Manage Guild 또는 Administrator가 포함되는지 */
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

/** 권한 확인 결과 — 401(세션 만료)과 Discord 장애(429/5xx/네트워크)를 구분해요 */
export type CanManageResult =
  | { status: "ok"; manageable: boolean }
  | { status: "unavailable" }
  | { status: "invalid-token" };

const OK_CACHE_TTL_MS = 60_000;
const UNAVAILABLE_CACHE_TTL_MS = 10_000;
const CACHE_MAX_ENTRIES = 1_000;
const DISCORD_TIMEOUT_MS = 8_000;

/**
 * resolveCanManage 결과 캐시. ok는 60초, unavailable은 10초만 캐시해요.
 * invalid-token은 캐시하지 않아요(재로그인 후 즉시 회복돼야 하므로).
 * 모듈 레벨 인메모리라 serverless 콜드스타트마다 비어 있을 수 있어요(허용).
 */
const resolveCache = new Map<
  string,
  { expires: number; result: CanManageResult; meta: GuildMeta | null }
>();

/**
 * 같은 (userId:guildId)로 동시에 들어온 조회를 하나의 Discord 요청으로 합쳐요.
 * 설정 화면이 패널마다 /users/@me/guilds를 병렬 호출해 같은 유저 토큰을 순간 폭주시키면
 * 429를 유발해 502로 번지므로, 단일 비행으로 요청 수를 줄여요.
 */
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
  const ttl =
    result.status === "ok"
      ? OK_CACHE_TTL_MS
      : result.status === "unavailable"
        ? UNAVAILABLE_CACHE_TTL_MS
        : 0;
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

/**
 * Redis 캐시 키 — redis.ts가 `sirubot:dashboard:` 접두사를 자동으로 붙여요.
 * 인스턴스 간에 권한 확인 결과를 공유해 Discord 호출 폭주(429→502 도미노)를 줄여요.
 */
function redisKey(userId: string, guildId: string): string {
  return `guild-perm:${userId}:${guildId}`;
}

/** 결과별 캐시 TTL — invalid-token은 0(캐시 안 함), 인메모리 writeCache와 동일해요. */
function cacheTtlMs(result: CanManageResult): number {
  return result.status === "ok"
    ? OK_CACHE_TTL_MS
    : result.status === "unavailable"
      ? UNAVAILABLE_CACHE_TTL_MS
      : 0;
}

/** Redis에서 캐시된 권한 결과를 읽어요 — 미사용/장애/파싱 실패 시 조용히 null(미스)로. */
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
    // 손상/형식 불일치 값은 미스로 취급해 새로 조회해요.
    return null;
  }
}

/** Redis에 권한 결과를 기록해요 — TTL 0(invalid-token)이거나 장애 시 조용히 건너뛰어요. */
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
    // Redis 장애는 인메모리 캐시로 폴백 — 예외를 전파하지 않아요.
  }
}

/** 같은 요청에서 얻은 서버 표시 정보 — /users/@me/guilds 응답의 name·icon이에요 */
export interface GuildMeta {
  name: string;
  icon: string | null;
}

/** 1회 시도 — 결과, 서버 메타, "즉시 재시도 가치가 있는지"를 함께 돌려줘요. */
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
      // 레이트리밋 — 즉시 재시도해도 소용없어요(오히려 악화).
      return { result: { status: "unavailable" }, retryable: false, meta: null };
    }
    if (res.status >= 500) {
      return { result: { status: "unavailable" }, retryable: true, meta: null };
    }
    if (!res.ok) {
      // 기타 비정상 응답 — 권한 여부를 알 수 없으니 보수적으로 false예요
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
    // 네트워크 오류/타임아웃 — 일시적일 수 있어 한 번은 더 시도해요.
    return { result: { status: "unavailable" }, retryable: true, meta: null };
  }
}

/**
 * 사용자 토큰으로 서버 관리 권한을 3상태로 확인해요.
 * - ok: Discord 응답 정상 — manageable이 실제 권한 여부예요
 * - unavailable: 429/5xx/네트워크 오류 — 권한 없음이 아니라 "지금 확인 불가"
 * - invalid-token: 401 — 세션 만료, 재로그인 필요
 */
export async function resolveCanManage(
  accessToken: string,
  userId: string,
  guildId: string,
): Promise<CanManageResult> {
  return (await resolveGuildsInfo(accessToken, userId, guildId)).result;
}

/** resolveGuildMembership 결과 — 권한 확인과 같은 3상태로 멤버십만 판정해요 */
export type GuildMembershipResult =
  | { status: "ok"; isMember: boolean }
  | { status: "unavailable" }
  | { status: "invalid-token" };

/**
 * 사용자 토큰으로 길드 멤버십만 확인해요 — @me/guilds 응답에 길드가 있으면 멤버예요.
 * 관리 권한(Manage Guild)과 무관하므로, 제어 권한(DJ) 판정이 필요한 player 페이지가 이걸 써요.
 * resolveCanManage와 같은 캐시/단일 비행을 공유해 별도의 Discord 호출을 만들지 않아요.
 */
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

/**
 * 권한 확인과 서버 표시 정보를 같은 Discord 호출로 해결해요 — 패널이 권한과 메타를
 * 따로 물어도 Discord 요청은 단일 비행 + 캐시 한 번이에요.
 */
async function resolveGuildsInfo(
  accessToken: string,
  userId: string,
  guildId: string,
): Promise<{ result: CanManageResult; meta: GuildMeta | null }> {
  const cacheKey = `${userId}:${guildId}`;
  const cached = readEntry(cacheKey);
  if (cached) return { result: cached.result, meta: cached.meta };

  // 인스턴스 간 공유 캐시 — 다른 인스턴스가 이미 확인했다면 Discord 호출 없이 돌려줘요.
  const redisCached = await readRedisCache(userId, guildId);
  if (redisCached) return redisCached;

  const existing = inflight.get(cacheKey);
  if (existing) return existing;

  const pending = (async (): Promise<{ result: CanManageResult; meta: GuildMeta | null }> => {
    const first = await fetchGuildsOnce(accessToken, guildId);
    let attempt = first;
    if (first.retryable) {
      // 5xx/네트워크는 다음 요청이 아니라 여기서 1회만 더 시도해요.
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

/**
 * 대시보드 헤더용 서버 표시 정보(이름·아이콘). 권한 확인과 동일한 캐시/단일 비행을 공유해요 —
 * 별도의 Discord 호출을 만들지 않아요. meta가 없으면(멤버 아님/장애) null이에요.
 */
export async function resolveGuildMeta(
  accessToken: string,
  userId: string,
  guildId: string,
): Promise<GuildMeta | null> {
  return (await resolveGuildsInfo(accessToken, userId, guildId)).meta;
}
