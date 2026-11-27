import { decryptSecret, decryptsWith, deriveKeyFromSecret, encryptSecret } from "@sirubot/utils/secretBox";
import { sleep } from "@sirubot/utils/time";

import { db } from "@/lib/db";
import { requestDiscordToken } from "@/lib/discord-token";
import { getSessionSecret } from "@/lib/env";
import { isRedisEnabled, randomLockToken, redisCompareAndDel, redisSetNx } from "@/lib/redis";

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAtMs: number;
  version: number;
}

export interface LegacyTokenSet {
  refreshToken: string;
  accessToken: string;
  expiresAtMs: number;
}

export type EnsureResult =
  | { status: "ok"; accessToken: string; expiresAtMs: number }
  | { status: "invalid" }
  | { status: "unavailable" };

const FRESH_MARGIN_MS = 10 * 60 * 1000;
const REFRESH_LOCK_TTL_MS = 12_000;
const POLL_MS = 150;
const WAIT_MAX_MS = 12_000;

function encryptionSecrets(): string[] {
  const dedicated = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  const session = getSessionSecret() ?? "";
  return [dedicated, session].filter((value): value is string => Boolean(value));
}

function encryptionKey(): Buffer | null {
  const [secret] = encryptionSecrets();
  return deriveKeyFromSecret(secret);
}

export function encryptToken(plain: string): string {
  return encryptSecret(plain, encryptionKey());
}

export function decryptToken(enc: string): string | null {
  return decryptSecret(enc, encryptionSecrets().map(deriveKeyFromSecret));
}

function needsRekey(enc: string): boolean {
  return !decryptsWith(enc, encryptionKey());
}

export async function readTokenSet(userId: string): Promise<TokenSet | null> {
  const key = encryptionKey();
  if (!key) return null;
  try {
    const row = await db.userToken.findUnique({ where: { userId } });
    if (!row) return null;
    const accessToken = decryptToken(row.accessToken);
    const refreshToken = decryptToken(row.refreshToken);
    if (accessToken === null || refreshToken === null) return null;
    if (needsRekey(row.accessToken) || needsRekey(row.refreshToken)) {
      void db.userToken
        .update({
          where: { userId, version: row.version },
          data: { accessToken: encryptToken(accessToken), refreshToken: encryptToken(refreshToken) },
        })
        .catch(() => undefined);
    }
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

function encodeSet(set: Omit<TokenSet, "version">): { accessToken: string; refreshToken: string; accessTokenExpiresAt: Date } {
  return {
    accessToken: encryptToken(set.accessToken),
    refreshToken: encryptToken(set.refreshToken),
    accessTokenExpiresAt: new Date(set.expiresAtMs),
  };
}

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
  }
}

async function insertTokenSetIfAbsent(
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
  }
}

async function writeTokenSetOptimistic(
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

async function deleteTokenSet(userId: string): Promise<void> {
  const key = encryptionKey();
  if (!key) return;
  try {
    await db.userToken.deleteMany({ where: { userId } });
  } catch {
  }
}

function isFresh(set: TokenSet): boolean {
  return set.expiresAtMs > Date.now() + FRESH_MARGIN_MS;
}

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

  if (!isRedisEnabled()) {
    return performRefresh(userId, null);
  }

  const lockVal = randomLockToken();
  const lockKey = "refresh:" + userId;

  if (await redisSetNx(lockKey, lockVal, REFRESH_LOCK_TTL_MS)) {
    return performRefresh(userId, lockVal);
  }

  const deadline = Date.now() + WAIT_MAX_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_MS);

    const latest = await readTokenSet(userId);
    if (latest && (latest.version !== row.version || isFresh(latest))) {
      return { status: "ok", accessToken: latest.accessToken, expiresAtMs: latest.expiresAtMs };
    }

    if (await redisSetNx(lockKey, lockVal, REFRESH_LOCK_TTL_MS)) {
      return performRefresh(userId, lockVal);
    }
  }

  const last = await readTokenSet(userId);
  if (last && isFresh(last)) {
    return { status: "ok", accessToken: last.accessToken, expiresAtMs: last.expiresAtMs };
  }
  return performRefresh(userId, null);
}

async function performRefresh(userId: string, lockVal: string | null): Promise<EnsureResult> {
  const lockKey = "refresh:" + userId;
  try {
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
        const winner = await readTokenSet(userId);
        if (winner) {
          return { status: "ok", accessToken: winner.accessToken, expiresAtMs: winner.expiresAtMs };
        }
        return { status: "invalid" };
      }
      return { status: "ok", accessToken: newSet.accessToken, expiresAtMs: newSet.expiresAtMs };
    }

    if (res.status === "invalid") {
      // Discord 400 may mean another request already rotated the token; adopt winner if version changed.
      const recheck = await readTokenSet(userId);
      if (recheck && recheck.version !== row.version) {
        return { status: "ok", accessToken: recheck.accessToken, expiresAtMs: recheck.expiresAtMs };
      }
      await deleteTokenSet(userId);
      return { status: "invalid" };
    }

    return { status: "unavailable" };
  } finally {
    if (lockVal) {
      await redisCompareAndDel(lockKey, lockVal);
    }
  }
}
