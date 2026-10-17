/**
 * 음성 서버(Lavalink) 통계 서버 연동 — 조회 전용 API에서 노드별 최신 통계를 읽어요.
 * 서버 주소는 env로만 참조하고 클라이언트 번들에 노출하지 않으려고 Route Handler에서만 호출해요.
 */
import { z } from "zod";

export interface VoiceServerNode {
	host: string;
	name: string;
	timestamp: string;
	players: number;
	playingPlayers: number;
	/** Lavalink 가동 시간 (ms) */
	uptime: number;
	memoryUsed: number;
	memoryAllocated: number;
	cpuCores: number;
	cpuSystemLoad: number;
	cpuLavalinkLoad: number;
}

const LAVALINK_STATS_URL = process.env.LAVALINK_STATS_URL || "https://lavalink.siru.life";

const voiceServerNodeSchema = z
	.object({
		host: z.string(),
		name: z.string().default(""),
		timestamp: z.string(),
		players: z.number(),
		playing_players: z.number(),
		uptime: z.number(),
		memory_used: z.number(),
		memory_allocated: z.number(),
		cpu_cores: z.number(),
		cpu_system_load: z.number(),
		cpu_lavalink_load: z.number(),
	})
	.transform(
		(row): VoiceServerNode => ({
			host: row.host,
			name: row.name,
			timestamp: row.timestamp,
			players: row.players,
			playingPlayers: row.playing_players,
			uptime: row.uptime,
			memoryUsed: row.memory_used,
			memoryAllocated: row.memory_allocated,
			cpuCores: row.cpu_cores,
			cpuSystemLoad: row.cpu_system_load,
			cpuLavalinkLoad: row.cpu_lavalink_load,
		}),
	);

const voiceServerStatsSchema = z.object({
	success: z.literal(true),
	data: z.array(voiceServerNodeSchema),
});

/** 통계 서버 응답을 검증하고 노드 목록으로 바꿔요. 형식이 다르면 null — 일부만 그리지 않아요. */
export function parseVoiceServerStats(payload: unknown): VoiceServerNode[] | null {
	const parsed = voiceServerStatsSchema.safeParse(payload);
	return parsed.success ? parsed.data.data : null;
}

/** GET /api/stats/latest (인증 불필요) — 실패(비2xx·타임아웃·형식 불일치)는 null. */
export async function fetchVoiceServerStats(): Promise<VoiceServerNode[] | null> {
	try {
		const res = await fetch(`${LAVALINK_STATS_URL}/api/stats/latest`, {
			cache: "no-store",
			signal: AbortSignal.timeout(10_000),
		});
		if (!res.ok) return null;
		return parseVoiceServerStats(await res.json());
	} catch {
		return null;
	}
}
