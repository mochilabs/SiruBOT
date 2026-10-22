// env.ts 회귀 계약 — 폴백 체인(키 ?? 공유키), 기본 URL, 호출 시점 재해석을 잠가요.
// admin-ids·token-store 테스트가 런타임에 env를 바꾸고 즉시 반영을 기대하는 계약의 근거지예요.
import { afterEach, describe, expect, it } from "vitest";

import {
  getDashboardAdminIdsRaw,
  getDataApiEnv,
  getDatabaseUrl,
  getDiscordOAuthEnv,
  getRedisUrl,
  getSessionSecret,
  getShardManagerEnv,
  getStorageEnv,
  getVoiceServerStatsUrl,
} from "./env";


/** 이 파일이 만진 env는 테스트마다 원위치해요 — 프로세스에 값을 남기지 않기 위함이에요. */
const touched = new Map<string, string | undefined>();

afterEach(() => {
  for (const [key, value] of touched) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  touched.clear();
});

/** 이 테스트가 건드리는 env 키 — afterEach에서 원위치할 대상이에요. */
type EnvKey =
  | "DATA_API_URL"
  | "DATA_API_AUTH_KEY"
  | "AUTH_KEY"
  | "STORAGE_URL"
  | "STORAGE_AUTH_KEY"
  | "SHARD_MANAGER_URL"
  | "SHARD_MANAGER_AUTH_KEY"
  | "LAVALINK_STATS_URL"
  | "DASHBOARD_ADMIN_IDS"
  | "REDIS_URL"
  | "DATABASE_URL"
  | "AUTH_SECRET"
  | "NEXTAUTH_SECRET"
  | "DISCORD_CLIENT_ID"
  | "DISCORD_CLIENT_SECRET";

/** 키를 이번 테스트 동안만 바꿔요 — 원본은 touched에 보관해요. */
function setEnv(key: EnvKey, value: string | undefined): void {
  if (!touched.has(key)) touched.set(key, process.env[key]);
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

describe("getDataApiEnv — data-api 폴백 체인", () => {
  it("DATA_API_AUTH_KEY 우선, 없으면 AUTH_KEY로 폴백해요 (|| — 빈 문자열도 폴백)", () => {
    setEnv("DATA_API_AUTH_KEY", "primary");
    setEnv("AUTH_KEY", "shared");
    expect(getDataApiEnv().authKey).toBe("primary");

    setEnv("DATA_API_AUTH_KEY", "");
    expect(getDataApiEnv().authKey).toBe("shared");

    setEnv("DATA_API_AUTH_KEY", undefined);
    expect(getDataApiEnv().authKey).toBe("shared");
  });

  it("둘 다 없으면 빈 문자열 (호출부가 스킵을 결정해요 — fail-open)", () => {
    setEnv("DATA_API_AUTH_KEY", undefined);
    setEnv("AUTH_KEY", undefined);
    expect(getDataApiEnv().authKey).toBe("");
  });

  it("URL 미설정 시 기본값 http://localhost:3002, 설정 시 그대로 써요 (트림 없음 — 기존 동작 유지)", () => {
    setEnv("DATA_API_URL", undefined);
    expect(getDataApiEnv().url).toBe("http://localhost:3002");

    setEnv("DATA_API_URL", "http://data-api:3002");
    expect(getDataApiEnv().url).toBe("http://data-api:3002");
  });

  it("호출 시점마다 다시 읽어요 — 런타임 변경이 즉시 반영된다", () => {
    setEnv("DATA_API_AUTH_KEY", "first");
    expect(getDataApiEnv().authKey).toBe("first");
    setEnv("DATA_API_AUTH_KEY", "second");
    expect(getDataApiEnv().authKey).toBe("second");
  });
});

describe("getStorageEnv — storage 폴백 체인", () => {
  it("STORAGE_AUTH_KEY 우선, 없으면 AUTH_KEY 폴백, 둘 다 없으면 빈 문자열", () => {
    setEnv("STORAGE_AUTH_KEY", "storage-key");
    setEnv("AUTH_KEY", "shared");
    expect(getStorageEnv().authKey).toBe("storage-key");

    setEnv("STORAGE_AUTH_KEY", undefined);
    expect(getStorageEnv().authKey).toBe("shared");

    setEnv("AUTH_KEY", undefined);
    expect(getStorageEnv().authKey).toBe("");
  });

  it("URL 미설정 시 기본값 http://localhost:3003", () => {
    setEnv("STORAGE_URL", undefined);
    expect(getStorageEnv().url).toBe("http://localhost:3003");
  });
});

describe("getShardManagerEnv — 인증 키 폴백 없음(기본 키 금지 계약)", () => {
  it("SHARD_MANAGER_AUTH_KEY는 원문 그대로, 폴백하지 않아요", () => {
    setEnv("SHARD_MANAGER_AUTH_KEY", "shard-key");
    setEnv("AUTH_KEY", "shared-should-not-leak");
    expect(getShardManagerEnv().authKey).toBe("shard-key");

    setEnv("SHARD_MANAGER_AUTH_KEY", undefined);
    expect(getShardManagerEnv().authKey).toBeUndefined();
  });

  it("URL 미설정 시 기본값 http://localhost:3001", () => {
    setEnv("SHARD_MANAGER_URL", undefined);
    expect(getShardManagerEnv().url).toBe("http://localhost:3001");
  });
});

describe("기타 accessor 기본값·폴백", () => {
  it("LAVALINK_STATS_URL 미설정 시 기본 통계 서버 주소", () => {
    setEnv("LAVALINK_STATS_URL", undefined);
    expect(getVoiceServerStatsUrl()).toBe("https://lavalink.siru.life");
  });

  it("DASHBOARD_ADMIN_IDS는 공백만 trim한 원문 (파싱·차단은 admin-ids 소유)", () => {
    setEnv("DASHBOARD_ADMIN_IDS", "  111 , 222  ");
    expect(getDashboardAdminIdsRaw()).toBe("111 , 222");

    setEnv("DASHBOARD_ADMIN_IDS", undefined);
    expect(getDashboardAdminIdsRaw()).toBe("");
  });

  it("AUTH_SECRET 우선, 없으면 NEXTAUTH_SECRET 폴백 (?? — 빈 문자열은 폴백 안 함)", () => {
    setEnv("AUTH_SECRET", "sec");
    setEnv("NEXTAUTH_SECRET", "legacy");
    expect(getSessionSecret()).toBe("sec");

    setEnv("AUTH_SECRET", "");
    expect(getSessionSecret()).toBe("");

    setEnv("AUTH_SECRET", undefined);
    expect(getSessionSecret()).toBe("legacy");

    setEnv("NEXTAUTH_SECRET", undefined);
    expect(getSessionSecret()).toBeUndefined();
  });

  it("Redis·DB URL은 미설정이면 undefined (메모리/지연 연결 폴백)", () => {
    setEnv("REDIS_URL", undefined);
    setEnv("DATABASE_URL", undefined);
    expect(getRedisUrl()).toBeUndefined();
    expect(getDatabaseUrl()).toBeUndefined();

    setEnv("REDIS_URL", "redis://localhost:6379");
    expect(getRedisUrl()).toBe("redis://localhost:6379");
  });

  it("Discord OAuth 자격은 둘 다 optional", () => {
    setEnv("DISCORD_CLIENT_ID", undefined);
    setEnv("DISCORD_CLIENT_SECRET", undefined);
    expect(getDiscordOAuthEnv()).toEqual({ clientId: undefined, clientSecret: undefined });

    setEnv("DISCORD_CLIENT_ID", "cid");
    expect(getDiscordOAuthEnv().clientId).toBe("cid");
  });
});
