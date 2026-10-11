import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { db } from "@/lib/db";
import { requestDiscordToken } from "@/lib/discord-token";
import { isRedisEnabled, randomLockToken, redisCompareAndDel, redisSetNx } from "@/lib/redis";

/**
 * Discord OAuth 토큰의 서버측 단일 원본(Postgres/Prisma).
 *
 * 기존엔 accessToken·refreshToken이 전부 JWT 쿠키에 있어서, 다중 인스턴스/다중 탭에서
 * refresh 토큰 로테이션 레이스(한쪽 400 → 세션 파기)가 났어요. refreshToken을 DB로
 * 중앙화하고 Redis 뮤텍스 + 낙관적 버전 잠금(WHERE version = ?)으로 동시 갱신을 직렬화해요.
 *
 * accessToken은 JWT에 미러로 남겨두고(핫패스 DB 조회 제로 유지 — session-token.ts 참고),
 * 여기서는 갱신·회전·백필·암호화 저장만 담당해요.
 */

/** 복호된 토큰 셋 — DB 행을 복호한 결과예요. */
export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAtMs: number;
  version: number;
}

/**
 * 구 세션 마이그레이션용 원본. JWT에 아직 refreshToken이 들어 있는(마이그레이션 전) 세션만
 * ensureFreshToken의 legacy 인자로 넘어와요.
 */
export interface LegacyTokenSet {
  refreshToken: string;
  accessToken: string;
  expiresAtMs: number;
}

export type EnsureResult =
  | { status: "ok"; accessToken: string; expiresAtMs: number }
  | { status: "invalid" }
  | { status: "unavailable" };

// 만료 10분 전부터 갱신을 시도해요 (JWT 쪽 빠른 경로와 동일한 마진).
const FRESH_MARGIN_MS = 10 * 60 * 1000;
// refresh 뮤텍스 TTL — Discord 호출(7초)보다 넉넉히 길어야 해요.
const REFRESH_LOCK_TTL_MS = 12_000;
// 대기자 폴링 간격.
const POLL_MS = 150;
// 대기자가 뮤텍스를 기다리는 최대 시간. 넘어서면 fail-open.
const WAIT_MAX_MS = 12_000;

/**
 * AES-256-GCM 키 — AUTH_SECRET(또는 NEXTAUTH_SECRET)의 SHA-256 다이제스트(32바이트).
 * 시크릿이 없으면 null을 돌려주고, 모든 함수가 "토큰 없음"으로 graceful하게 동작해요.
 */
function encryptionKey(): Buffer | null {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";
  if (!secret) return null;
  return createHash("sha256").update(secret).digest();
}

/** 평문 토큰을 `base64url(iv):base64url(authTag):base64url(ciphertext)`로 암호화해요. */
export function encryptToken(plain: string): string {
  const key = encryptionKey();
  if (!key) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((b) => b.toString("base64url")).join(":");
}

/** 암호화 문자열을 복호해요. 파싱/복호 실패 시 null(→ 재로그인 경로). throw 금지. */
export function decryptToken(enc: string): string | null {
  const key = encryptionKey();
  if (!key) return null;
  try {
    const [ivPart, tagPart, dataPart] = enc.split(":");
    if (!ivPart || !tagPart || !dataPart) return null;
    const iv = Buffer.from(ivPart, "base64url");
    const authTag = Buffer.from(tagPart, "base64url");
    const ciphertext = Buffer.from(dataPart, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** DB 행을 복호해 TokenSet으로 변환. 행 없음/복호 실패 시 null. */
export async function readTokenSet(userId: string): Promise<TokenSet | null> {
  const key = encryptionKey();
  if (!key) return null;
  try {
    const row = await db.userToken.findUnique({ where: { userId } });
    if (!row) return null;
    const accessToken = decryptToken(row.accessToken);
    const refreshToken = decryptToken(row.refreshToken);
    if (accessToken === null || refreshToken === null) return null;
    return {
      accessToken,
      refreshToken,
      expiresAtMs: row.accessTokenExpiresAt.getTime(),
      version: row.version,
    };
  } catch {
    return null;
  }
}

/** 토큰 셋을 암호화해 DB 기록용 컬럼으로 변환해요. */
function encodeSet(set: Omit<TokenSet, "version">): { accessToken: string; refreshToken: string; accessTokenExpiresAt: Date } {
  return {
    accessToken: encryptToken(set.accessToken),
    refreshToken: encryptToken(set.refreshToken),
    accessTokenExpiresAt: new Date(set.expiresAtMs),
  };
}

/** 로그인용 — 기존 행을 덮어쓰고 version을 1 증가시켜요. */
export async function replaceTokenSet(
  userId: string,
  set: Omit<TokenSet, "version">,
): Promise<void> {
  const key = encryptionKey();
  if (!key) return;
  const data = encodeSet(set);
  try {
    await db.userToken.upsert({
      where: { userId },
      create: { userId, ...data, version: 1 },
      update: { ...data, version: { increment: 1 } },
    });
  } catch {
    // 저장 실패는 재로그인 경로로 흘려보내고 여기서는 무시해요.
  }
}

/**
 * 백필용 — 행이 이미 있으면 아무것도 안 해요(no-op update).
 * 동시 백필이 겹쳐도 기존(더 새) 데이터를 덮어쓰지 않도록 멱등하게 유지해요.
 */
export async function insertTokenSetIfAbsent(
  userId: string,
  set: Omit<TokenSet, "version">,
): Promise<void> {
  const key = encryptionKey();
  if (!key) return;
  const data = encodeSet(set);
  try {
    await db.userToken.upsert({
      where: { userId },
      create: { userId, ...data, version: 1 },
      update: {},
    });
  } catch {
    // 백필 실패는 치명적이지 않아요.
  }
}

/**
 * 낙관적 잠금 쓰기 — expectedVersion과 일치할 때만 갱신해요(version 1 증가).
 * 경쟁에서 진 요청은 0건이 반환돼 "승자 채택"으로 폴백해요.
 */
export async function writeTokenSetOptimistic(
  userId: string,
  set: Omit<TokenSet, "version">,
  expectedVersion: number,
): Promise<boolean> {
  const key = encryptionKey();
  if (!key) return false;
  const data = encodeSet(set);
  try {
    const { count } = await db.userToken.updateMany({
      where: { userId, version: expectedVersion },
      data: { ...data, version: { increment: 1 } },
    });
    return count > 0;
  } catch {
    return false;
  }
}

/** 토큰 셋 삭제 (진짜 폐기 시). */
export async function deleteTokenSet(userId: string): Promise<void> {
  const key = encryptionKey();
  if (!key) return;
  try {
    await db.userToken.deleteMany({ where: { userId } });
  } catch {
    // 삭제 실패는 재로그인 경로로 흘려보내요.
  }
}

function isFresh(set: TokenSet): boolean {
  return set.expiresAtMs > Date.now() + FRESH_MARGIN_MS;
}

/**
 * 호출 시점에 쓸 수 있는 fresh accessToken을 보장해요.
 * - 행이 없고 legacy가 있으면 백필 후 재조회.
 * - fresh면 바로 ok (DB/Redis 뮤텍스 안 침).
 * - 아니면 뮤텍스를 잡고 갱신하거나, 대기자로 승자를 기다려요.
 */
export async function ensureFreshToken(userId: string, legacy?: LegacyTokenSet): Promise<EnsureResult> {
  let row = await readTokenSet(userId);
  if (!row) {
    if (legacy) {
      await insertTokenSetIfAbsent(userId, {
        accessToken: legacy.accessToken,
        refreshToken: legacy.refreshToken,
        expiresAtMs: legacy.expiresAtMs,
      });
      row = await readTokenSet(userId);
    }
    if (!row) return { status: "invalid" };
  }

  if (isFresh(row)) {
    return { status: "ok", accessToken: row.accessToken, expiresAtMs: row.expiresAtMs };
  }

  // Redis 미사용(REDIS_URL 미설정) → 뮤텍스·대기 없이 즉시 fail-open.
  if (!isRedisEnabled()) {
    return performRefresh(userId, null);
  }

  const lockVal = randomLockToken();
  const lockKey = "refresh:" + userId;

  if (await redisSetNx(lockKey, lockVal, REFRESH_LOCK_TTL_MS)) {
    // 뮤텍스 획득 — 홀더가 되어 직접 갱신해요.
    return performRefresh(userId, lockVal);
  }

  // 대기자 — 승자가 토큰을 회전할 때까지 폴링해요.
  const deadline = Date.now() + WAIT_MAX_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_MS);

    // 승자 채택 — version이 바뀌었거나 fresh해지면 즉시 반환해요.
    const latest = await readTokenSet(userId);
    if (latest && (latest.version !== row.version || isFresh(latest))) {
      return { status: "ok", accessToken: latest.accessToken, expiresAtMs: latest.expiresAtMs };
    }

    // 홀더가 해제했으면 내가 이어받아요.
    if (await redisSetNx(lockKey, lockVal, REFRESH_LOCK_TTL_MS)) {
      return performRefresh(userId, lockVal);
    }
  }

  // 뮤텍스를 끝내 못 얻음(홀더 스톨/Redis 장애) → fail-open: 뮤텍스 없이 진행해요.
  // 400 판정(performRefresh)이 안전망이라 레이스 위험을 감수할 수 있어요.
  const last = await readTokenSet(userId);
  if (last && isFresh(last)) {
    return { status: "ok", accessToken: last.accessToken, expiresAtMs: last.expiresAtMs };
  }
  return performRefresh(userId, null);
}

/**
 * 실제 갱신 수행. lockVal이 null이면 뮤텍스 없이(fail-open) 진행해요.
 */
async function performRefresh(userId: string, lockVal: string | null): Promise<EnsureResult> {
  const lockKey = "refresh:" + userId;
  try {
    // 획득 후 권위 재조회 — 사본(expected)을 곧바로 쓰지 않아요.
    const row = await readTokenSet(userId);
    if (!row) return { status: "invalid" };
    if (isFresh(row)) {
      return { status: "ok", accessToken: row.accessToken, expiresAtMs: row.expiresAtMs };
    }

    const res = await requestDiscordToken(row.refreshToken);

    if (res.status === "ok") {
      const newSet = {
        accessToken: res.token.access_token,
        refreshToken: res.token.refresh_token ?? row.refreshToken,
        expiresAtMs: Date.now() + (res.token.expires_in ?? 604800) * 1000,
      };
      const wrote = await writeTokenSetOptimistic(userId, newSet, row.version);
      if (!wrote) {
        // 낙관적 잠금 실패 — 다른 요청이 먼저 회전했어요. 승자를 채택해요.
        const winner = await readTokenSet(userId);
        if (winner) {
          return { status: "ok", accessToken: winner.accessToken, expiresAtMs: winner.expiresAtMs };
        }
        return { status: "invalid" };
      }
      return { status: "ok", accessToken: newSet.accessToken, expiresAtMs: newSet.expiresAtMs };
    }

    if (res.status === "invalid") {
      // 400 모호성 판정 — Discord 400은 "이미 소비됨"일 수도, "진짜 폐기"일 수도 있어요.
      // 다른 요청이 이미 회전했다면(version 변경) 경쟁 패배 → 승자 채택.
      const recheck = await readTokenSet(userId);
      if (recheck && recheck.version !== row.version) {
        return { status: "ok", accessToken: recheck.accessToken, expiresAtMs: recheck.expiresAtMs };
      }
      await deleteTokenSet(userId);
      return { status: "invalid" };
    }

    // unavailable — 토큰을 유지하고 호출부가 쿨다운으로 재시도해요.
    return { status: "unavailable" };
  } finally {
    if (lockVal) {
      await redisCompareAndDel(lockKey, lockVal);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
