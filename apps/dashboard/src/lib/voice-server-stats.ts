/**
 * 음성 서버(Lavalink) 통계 서버 연동 — 조회 전용 API에서 노드 통계(최신/이력)를 읽어요.
 * 서버 주소는 env로만 참조하고 클라이언트 번들에 노출하지 않으려고 Route Handler에서만 호출해요.
 */
import { z } from "zod";

import { getVoiceServerStatsUrl } from "@/lib/env";

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

export interface VoiceServerHistoryPoint {
	/** 분 단위 버킷 ("YYYY-MM-DD HH:mm") — 노드별 수집 시각이 초 단위로 달라도 함께 묶어요. 표기는 원문 그대로(시간대 미검증) */
	time: string;
	players: number;
	playingPlayers: number;
	cpuSystemLoad: number;
	cpuLavalinkLoad: number;
}

/**
 * 공개용 음성 서버 요약 — `/api/voice-servers`가 비로그인에게도 내려주는 안전한 합계예요.
 * host(Lavalink 노드 주소)·name(노드 별칭)·CPU 부하·메모리 등 인프라 텔레메트리는 공격 표면이라
 * 제거하고 스트리밍 개수(플레이어 합계)만 노출해요. 노드별 카드는 토폴로지를 드러내므로 내리지 않아요.
 */
export interface PublicVoiceServerSummary {
	/** 활성 노드 수 — "노드 없음" 표시와 안내용 */
	nodeCount: number;
	/** 접속 중인 플레이어 합계 */
	totalPlayers: number;
	/** 재생 중인 플레이어 합계 */
	totalPlaying: number;
}

/** 원격 노드 통계 목록에서 공개 가능한 합계만 계산해요 — host/name/cpu/memory/uptime은 절대 복사하지 않아요. */
export function toPublicVoiceServerSummary(rows: VoiceServerNode[]): PublicVoiceServerSummary {
	let totalPlayers = 0;
	let totalPlaying = 0;
	for (const row of rows) {
		totalPlayers += row.players;
		totalPlaying += row.playingPlayers;
	}
	return {
		nodeCount: rows.length,
		totalPlayers,
		totalPlaying,
	};
}

/** 공개용 시계열 포인트 — 플레이어 수만 남기고 CPU 부하(시스템/Lavalink)를 제거한 축약형이에요. */
export interface PublicVoiceServerHistoryPoint {
	time: string;
	players: number;
	playingPlayers: number;
}

/** 시계열 집계 결과에서 공개용 포인트만 남겨요 — CPU 필드는 절대 복사하지 않아요. */
export function toPublicVoiceServerHistory(points: VoiceServerHistoryPoint[]): PublicVoiceServerHistoryPoint[] {
	return points.map((point) => ({
		time: point.time,
		players: point.players,
		playingPlayers: point.playingPlayers,
	}));
}

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

// 이력 행 스키마는 latest와 같고 rn만 없어요 — 한 스키마로 두 엔드포인트를 모두 검증해요.
const voiceServerRowsSchema = z.object({
	success: z.literal(true),
	data: z.array(voiceServerNodeSchema),
});

/** 통계 서버 응답을 검증하고 행 목록으로 바꿔요. 형식이 다르면 null — 일부만 그리지 않아요. */
export function parseVoiceServerRows(payload: unknown): VoiceServerNode[] | null {
	const parsed = voiceServerRowsSchema.safeParse(payload);
	return parsed.success ? parsed.data.data : null;
}

/** 시계열 행을 분 단위 버킷으로 묶어요 — 플레이어는 노드 합, CPU 부하는 노드 평균. 시간 오름차순. */
export function aggregateVoiceServerHistory(rows: VoiceServerNode[]): VoiceServerHistoryPoint[] {
	const buckets = new Map<string, { players: number; playingPlayers: number; cpuSystemLoad: number; cpuLavalinkLoad: number; count: number }>();
	for (const row of rows) {
		const key = row.timestamp.slice(0, 16);
		const bucket = buckets.get(key) ?? { players: 0, playingPlayers: 0, cpuSystemLoad: 0, cpuLavalinkLoad: 0, count: 0 };
		bucket.players += row.players;
		bucket.playingPlayers += row.playingPlayers;
		bucket.cpuSystemLoad += row.cpuSystemLoad;
		bucket.cpuLavalinkLoad += row.cpuLavalinkLoad;
		bucket.count += 1;
		buckets.set(key, bucket);
	}
	return [...buckets.entries()]
		.map(([time, bucket]) => ({
			time,
			players: bucket.players,
			playingPlayers: bucket.playingPlayers,
			cpuSystemLoad: bucket.cpuSystemLoad / bucket.count,
			cpuLavalinkLoad: bucket.cpuLavalinkLoad / bucket.count,
		}))
		.sort((a, b) => a.time.localeCompare(b.time));
}

/** GET /api/stats/latest (인증 불필요) — 실패(비2xx·타임아웃·형식 불일치)는 null. */
export async function fetchVoiceServerStats(): Promise<VoiceServerNode[] | null> {
	try {
		const res = await fetch(`${getVoiceServerStatsUrl()}/api/stats/latest`, {
			cache: "no-store",
			signal: AbortSignal.timeout(10_000),
		});
		if (!res.ok) return null;
		return parseVoiceServerRows(await res.json());
	} catch {
		return null;
	}
}

/** GET /api/stats/history?hours=N (인증 불필요) — 노드별 이력을 집계한 시계열. 실패는 null. */
export async function fetchVoiceServerHistory(hours: number): Promise<VoiceServerHistoryPoint[] | null> {
	try {
		const res = await fetch(`${getVoiceServerStatsUrl()}/api/stats/history?hours=${hours}`, {
			cache: "no-store",
			signal: AbortSignal.timeout(10_000),
		});
		if (!res.ok) return null;
		const rows = parseVoiceServerRows(await res.json());
		return rows ? aggregateVoiceServerHistory(rows) : null;
	} catch {
		return null;
	}
}
