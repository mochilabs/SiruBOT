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

/** canManage 확인 결과 — 401(세션 만료)과 Discord 장애(429/5xx/네트워크)를 구분해요 */
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
  { expires: number; result: CanManageResult }
>();

/**
 * 같은 (userId:guildId)로 동시에 들어온 조회를 하나의 Discord 요청으로 합쳐요.
 * 설정 화면이 패널마다 /users/@me/guilds를 병렬 호출해 같은 유저 토큰을 순간 폭주시키면
 * 429를 유발해 502로 번지므로, 단일 비행으로 요청 수를 줄여요.
 */
const inflight = new Map<string, Promise<CanManageResult>>();

function readCache(cacheKey: string): CanManageResult | null {
  const cached = resolveCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expires <= Date.now()) {
    resolveCache.delete(cacheKey);
    return null;
  }
  return cached.result;
}

function writeCache(cacheKey: string, result: CanManageResult): void {
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
      if (entry.expires <= now) resolveCache.delete(key);
      if (resolveCache.size < CACHE_MAX_ENTRIES) break;
    }
  }
  resolveCache.set(cacheKey, { expires: Date.now() + ttl, result });
}

/** 1회 시도 — 결과와 "즉시 재시도 가치가 있는지"를 함께 돌려줘요. */
async function fetchGuildsOnce(
  accessToken: string,
  guildId: string,
): Promise<{
  result: CanManageResult;
  retryable: boolean;
}> {
  try {
    const res = await fetch("https://discord.com/api/v10/users/@me/guilds", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(DISCORD_TIMEOUT_MS),
    });
    if (res.status === 401) {
      return { result: { status: "invalid-token" }, retryable: false };
    }
    if (res.status === 429) {
      // 레이트리밋 — 즉시 재시도해도 소용없어요(오히려 악화).
      return { result: { status: "unavailable" }, retryable: false };
    }
    if (res.status >= 500) {
      return { result: { status: "unavailable" }, retryable: true };
    }
    if (!res.ok) {
      // 기타 비정상 응답 — 권한 여부를 알 수 없으니 보수적으로 false예요
      return { result: { status: "ok", manageable: false }, retryable: false };
    }
    const guilds: Array<{ id: string; permissions: string | number }> =
      await res.json();
    const guild = Array.isArray(guilds)
      ? guilds.find((g) => g.id === guildId)
      : undefined;
    return {
      result: {
        status: "ok",
        manageable: guild !== undefined
          ? hasManageablePermissions(guild.permissions)
          : false,
      },
      retryable: false,
    };
  } catch {
    // 네트워크 오류/타임아웃 — 일시적일 수 있어 한 번은 더 시도해요.
    return { result: { status: "unavailable" }, retryable: true };
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
  const cacheKey = `${userId}:${guildId}`;
  const cached = readCache(cacheKey);
  if (cached) return cached;

  const existing = inflight.get(cacheKey);
  if (existing) return existing;

  const pending = (async (): Promise<CanManageResult> => {
    const first = await fetchGuildsOnce(accessToken, guildId);
    let result = first.result;
    if (first.retryable) {
      // 5xx/네트워크는 다음 요청이 아니라 여기서 1회만 더 시도해요.
      result = (await fetchGuildsOnce(accessToken, guildId)).result;
    }
    writeCache(cacheKey, result);
    return result;
  })().finally(() => {
    if (inflight.get(cacheKey) === pending) inflight.delete(cacheKey);
  });

  inflight.set(cacheKey, pending);
  return pending;
}

/** 사용자 토큰으로 서버 관리 권한(Manage Guild/Administrator) 확인 — 하위 호환 boolean 헬퍼 */
export async function canManage(
  accessToken: string,
  userId: string,
  guildId: string,
): Promise<boolean> {
  const result = await resolveCanManage(accessToken, userId, guildId);
  return result.status === "ok" && result.manageable;
}
