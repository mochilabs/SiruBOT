interface DataApiPlaybackCounts {
    track_start: number;
    track_end: number;
    track_stuck: number;
    track_error: number;
    queue_end: number;
    playback_abort: number;
}

interface DataApiPlaybackError {
    type: string;
    guildId: string;
    shardId: number | null;
    trackTitle: string | null;
    trackAuthor: string | null;
    reason: string | null;
    consecutiveErrors: number;
    at: number;
}

export interface DataApiStatus {
    ok: boolean;
    redis: boolean;
    cache: { redisHits: number; memoryHits: number; misses: number };
    routes: Record<string, { requests: number; cacheHits: number; upstreamCalls: number; upstreamErrors: number }>;
    playback: { counts: DataApiPlaybackCounts; recentErrors: DataApiPlaybackError[] };
}

const DATA_API_URL = process.env.DATA_API_URL || "http://localhost:3002";
const DATA_API_AUTH_KEY = process.env.DATA_API_AUTH_KEY || process.env.AUTH_KEY || "";

/**
 * data-api GET 프록시 — AUTH_KEY는 서버 전용(env). 클라이언트 번들로 절대 노출하지 않아요.
 * 키가 없으면(또는 공백뿐이면) 실패시키지 않고 null — 무인증 localhost 호출을 안 한다.
 */
export async function fetchDataApi<T>(path: string): Promise<T | null> {
    const authKey = DATA_API_AUTH_KEY.trim();
    if (!authKey) {
        console.warn("[data-api] DATA_API_AUTH_KEY/AUTH_KEY 미설정 — data-api 호출을 건너뛴다.");
        return null;
    }

    try {
        const res = await fetch(`${DATA_API_URL}${path}`, {
            cache: "no-store",
            headers: { Authorization: authKey },
        });
        if (!res.ok) return null;
        return (await res.json()) as T;
    } catch {
        return null;
    }
}

/**
 * data-api SSE 스트림 프록시 — 인증 헤더를 붙여 upstream Response를 그대로 돌려준다.
 * 미설정이면 null (라우트에서 502 응답으로 변환).
 */
export async function openDataApiStream(path: string): Promise<Response | null> {
    const authKey = DATA_API_AUTH_KEY.trim();
    if (!authKey) return null;

    try {
        const upstream = await fetch(`${DATA_API_URL}${path}`, {
            headers: { Authorization: authKey },
            cache: "no-store",
        });
        if (!upstream.ok || !upstream.body) return null;
        return upstream;
    } catch {
        return null;
    }
}

/**
 * data-api POST 프록시 (JSON) — AUTH_KEY는 서버 전용(env). 클라이언트 번들로 절대 노출하지 않아요.
 * 키가 없으면 실패시키지 않고 null. 네트워크/HTTP 오류도 null — 호출자가 실패 내성을 결정해요.
 */
export async function postDataApi<T>(path: string, body: unknown): Promise<T | null> {
    const authKey = DATA_API_AUTH_KEY.trim();
    if (!authKey) return null;

    try {
        const res = await fetch(`${DATA_API_URL}${path}`, {
            method: "POST",
            cache: "no-store",
            headers: { Authorization: authKey, "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!res.ok) return null;
        return (await res.json()) as T;
    } catch {
        return null;
    }
}

/** 길드 설정 캐시 무효화 브로드캐스트 결과 */
export interface GuildSettingsInvalidateResult {
    ok: boolean;
}

/**
 * 길드 설정 변경을 모든 봇 프로세스에 브로드캐스트 — 대시보드 PUT 성공 직후 호출해요.
 * data-api가 Redis 채널로 publish하고 각 봇이 자기 GuildService 캐시를 비워요.
 * 실패(null)여도 봇은 60초 TTL 폴백으로 결국 최신 설정을 읽으니 조용히 넘어가요.
 */
export async function notifyGuildSettingsChanged(guildId: string): Promise<boolean> {
    const result = await postDataApi<GuildSettingsInvalidateResult>(
        "/v1/internal/guild-settings/invalidate",
        { guildId },
    );
    return result?.ok === true;
}

/**
 * data-api 상태 조회 — 관제 페이지(/api/data-api)용. 폴백 체인(DATA_API_AUTH_KEY || AUTH_KEY)은
 * 기존 방침을 유지한다. 키가 없으면(또는 공백뿐이면) 실패시키지 않고 경고 후 스킵.
 */
export async function fetchDataApiStatus(): Promise<DataApiStatus | null> {
    // 폴백 체인(DATA_API_AUTH_KEY || AUTH_KEY)은 기존 방침을 유지한다.
    // 키가 없으면(또는 공백뿐이면) 실패시키지 않고 경고 후 스킵 — 무인증 localhost 호출을 안 한다.
    const authKey = DATA_API_AUTH_KEY.trim();
    if (!authKey) {
        console.warn("[data-api] DATA_API_AUTH_KEY/AUTH_KEY 미설정 — 무인증 호출 대신 status 조회를 건너뛴다.");
        return null;
    }

    try {
        const res = await fetch(`${DATA_API_URL}/v1/status`, {
            cache: "no-store",
            headers: { Authorization: authKey },
        });
        if (!res.ok) return null;
        return (await res.json()) as DataApiStatus;
    } catch {
        return null;
    }
}
