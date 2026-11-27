import { z } from "zod";

import { getVoiceServerStatsUrl } from "@/lib/env";

export interface VoiceServerNode {
	host: string;
	name: string;
	timestamp: string;
	players: number;
	playingPlayers: number;
	uptime: number;
	memoryUsed: number;
	memoryAllocated: number;
	cpuCores: number;
	cpuSystemLoad: number;
	cpuLavalinkLoad: number;
}

export interface VoiceServerHistoryPoint {
	time: string;
	players: number;
	playingPlayers: number;
	cpuSystemLoad: number;
	cpuLavalinkLoad: number;
}

export interface PublicVoiceServerSummary {
	nodeCount: number;
	totalPlayers: number;
	totalPlaying: number;
}

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

export interface PublicVoiceServerHistoryPoint {
	time: string;
	players: number;
	playingPlayers: number;
}

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

const voiceServerRowsSchema = z.object({
	success: z.literal(true),
	data: z.array(voiceServerNodeSchema),
});

export function parseVoiceServerRows(payload: unknown): VoiceServerNode[] | null {
	const parsed = voiceServerRowsSchema.safeParse(payload);
	return parsed.success ? parsed.data.data : null;
}

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
