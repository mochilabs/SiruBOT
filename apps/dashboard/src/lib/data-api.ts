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
    translation: { provider: string; available: boolean };
    ohaasa: { date: string | null; refreshedAt: number | null };
    playback: { counts: DataApiPlaybackCounts; recentErrors: DataApiPlaybackError[] };
}

const DATA_API_URL = process.env.DATA_API_URL || "http://localhost:3002";
const DATA_API_AUTH_KEY = process.env.DATA_API_AUTH_KEY || process.env.AUTH_KEY || "";

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
