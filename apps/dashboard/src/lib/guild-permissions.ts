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

const CACHE_TTL_MS = 30_000;
const CACHE_MAX_ENTRIES = 1_000;

/**
 * resolveCanManage 성공(ok) 결과 캐시 — 30초. 모듈 레벨 인메모리라 serverless
 * 콜드스타트마다 비어 있을 수 있어요(허용). unavailable/invalid-token은 일시적 상태라
 * 캐시하지 않아요. 토큰은 키에 넣지 않고 길이만 써서 노출을 줄여요.
 */
const resolveCache = new Map<
  string,
  { expires: number; result: CanManageResult }
>();

function readCache(cacheKey: string): CanManageResult | null {
  const cached = resolveCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expires <= Date.now()) return null;
  return cached.result;
}

function writeCache(cacheKey: string, result: CanManageResult): void {
  if (resolveCache.size >= CACHE_MAX_ENTRIES) {
    const now = Date.now();
    for (const [key, entry] of resolveCache) {
      if (entry.expires <= now) resolveCache.delete(key);
      if (resolveCache.size < CACHE_MAX_ENTRIES) break;
    }
  }
  resolveCache.set(cacheKey, { expires: Date.now() + CACHE_TTL_MS, result });
}

/**
 * 사용자 토큰으로 서버 관리 권한을 3상태로 확인해요.
 * - ok: Discord 응답 정상 — manageable이 실제 권한 여부예요
 * - unavailable: 429/5xx/네트워크 오류 — 권한 없음이 아니라 "지금 확인 불가"
 * - invalid-token: 401 — 세션 만료, 재로그인 필요
 */
export async function resolveCanManage(
  accessToken: string,
  guildId: string,
): Promise<CanManageResult> {
  const cacheKey = `${accessToken.length}:${guildId}`;
  const cached = readCache(cacheKey);
  if (cached) return cached;

  let result: CanManageResult;
  try {
    const res = await fetch("https://discord.com/api/v10/users/@me/guilds", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (res.status === 401) {
      result = { status: "invalid-token" };
    } else if (res.status === 429 || res.status >= 500) {
      result = { status: "unavailable" };
    } else if (!res.ok) {
      // 기타 비정상 응답 — 권한 여부를 알 수 없으니 보수적으로 false여요
      result = { status: "ok", manageable: false };
    } else {
      const guilds: Array<{ id: string; permissions: string | number }> =
        await res.json();
      const guild = Array.isArray(guilds)
        ? guilds.find((g) => g.id === guildId)
        : undefined;
      result = {
        status: "ok",
        manageable: guild !== undefined
          ? hasManageablePermissions(guild.permissions)
          : false,
      };
    }
  } catch {
    result = { status: "unavailable" };
  }

  if (result.status === "ok") writeCache(cacheKey, result);
  return result;
}

/** 사용자 토큰으로 서버 관리 권한(Manage Guild/Administrator) 확인 — 하위 호환 boolean 헬퍼 */
export async function canManage(
  accessToken: string,
  guildId: string,
): Promise<boolean> {
  const result = await resolveCanManage(accessToken, guildId);
  return result.status === "ok" && result.manageable;
}