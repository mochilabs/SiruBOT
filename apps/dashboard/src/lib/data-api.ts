export interface DataApiPlaybackCounts {
    track_start: number;
    track_end: number;
    track_stuck: number;
    track_error: number;
    queue_end: number;
    playback_abort: number;
}

export interface DataApiPlaybackError {
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
    try {
        const res = await fetch(`${DATA_API_URL}/v1/status`, {
            cache: "no-store",
            headers: DATA_API_AUTH_KEY ? { Authorization: DATA_API_AUTH_KEY } : {},
        });
        if (!res.ok) return null;
        return (await res.json()) as DataApiStatus;
    } catch {
        return null;
    }
}
