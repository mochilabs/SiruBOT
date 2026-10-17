import { describe, expect, it } from "vitest";

import { aggregateVoiceServerHistory, parseVoiceServerRows } from "./voice-server-stats";

// 통계 서버는 외부 서비스라 응답을 신뢰하지 않고 검증해요 — 이 테스트는 검증·집계 계약을 잠가요.
// measuredRow는 2026-10-17 실측 응답(GET /api/stats/latest)의 한 행이에요.
const measuredRow = {
	id: 7,
	host: "10.0.0.21:2333",
	name: "SRV 1",
	timestamp: "2026-10-17 07:43:22",
	players: 6,
	playing_players: 4,
	uptime: 343872432,
	memory_free: 106206816,
	memory_used: 430664096,
	memory_allocated: 536870912,
	memory_reservable: 4294967296,
	cpu_cores: 16,
	cpu_system_load: 0.0881,
	cpu_lavalink_load: 0.006,
	rn: 1,
};

describe("parseVoiceServerRows 응답 검증", () => {
	it("실측 응답 행을 camelCase 노드로 변환해요", () => {
		expect(parseVoiceServerRows({ success: true, data: [measuredRow] })).toEqual([
			{
				host: "10.0.0.21:2333",
				name: "SRV 1",
				timestamp: "2026-10-17 07:43:22",
				players: 6,
				playingPlayers: 4,
				uptime: 343872432,
				memoryUsed: 430664096,
				memoryAllocated: 536870912,
				cpuCores: 16,
				cpuSystemLoad: 0.0881,
				cpuLavalinkLoad: 0.006,
			},
		]);
	});

	it("봉투 밖 필드(id, memory_free, rn)는 버려요", () => {
		const [node] = parseVoiceServerRows({ success: true, data: [measuredRow] }) ?? [];
		expect(node).toBeDefined();
		expect(node).not.toHaveProperty("rn");
		expect(node).not.toHaveProperty("id");
		expect(node).not.toHaveProperty("memory_free");
	});

	it("노드가 없으면 빈 목록을 돌려줘요 (빈 data 배열)", () => {
		expect(parseVoiceServerRows({ success: true, data: [] })).toEqual([]);
	});

	it("success: false 봉투는 null이에요", () => {
		expect(parseVoiceServerRows({ success: false, error: "Internal Server Error" })).toBeNull();
	});

	it("data가 배열이 아니면 null이에요", () => {
		expect(parseVoiceServerRows({ success: true, data: { host: "10.0.0.21:2333" } })).toBeNull();
	});

	it("필수 필드가 빈 행이 하나라도 있으면 null — 일부만 그리지 않아요", () => {
		const incomplete = { ...measuredRow };
		delete (incomplete as Partial<typeof measuredRow>).cpu_cores;
		expect(parseVoiceServerRows({ success: true, data: [measuredRow, incomplete] })).toBeNull();
	});
});

describe("aggregateVoiceServerHistory 집계", () => {
	const rows = [
		{
			host: "10.0.0.21:2333",
			name: "SRV 1",
			timestamp: "2026-10-17 07:43:22",
			players: 6,
			playingPlayers: 4,
			uptime: 1000,
			memoryUsed: 1,
			memoryAllocated: 2,
			cpuCores: 16,
			cpuSystemLoad: 0.1,
			cpuLavalinkLoad: 0.02,
		},
		{
			host: "10.0.0.21:2334",
			name: "SRV 2",
			timestamp: "2026-10-17 07:43:58",
			players: 4,
			playingPlayers: 2,
			uptime: 1000,
			memoryUsed: 1,
			memoryAllocated: 2,
			cpuCores: 16,
			cpuSystemLoad: 0.2,
			cpuLavalinkLoad: 0.04,
		},
		{
			host: "10.0.0.21:2333",
			name: "SRV 1",
			timestamp: "2026-10-17 07:44:10",
			players: 7,
			playingPlayers: 5,
			uptime: 2000,
			memoryUsed: 1,
			memoryAllocated: 2,
			cpuCores: 16,
			cpuSystemLoad: 0.3,
			cpuLavalinkLoad: 0.06,
		},
	];

	it("같은 분의 노드 행은 합(플레이어)·평균(CPU)으로 묶어요", () => {
		const points = aggregateVoiceServerHistory(rows);
		expect(points).toHaveLength(2);
		const [first] = points;
		expect(first.time).toBe("2026-10-17 07:43");
		expect(first.players).toBe(10);
		expect(first.playingPlayers).toBe(6);
		expect(first.cpuSystemLoad).toBeCloseTo(0.15);
		expect(first.cpuLavalinkLoad).toBeCloseTo(0.03);
	});

	it("분 단위로 정렬해 시간 오름차순으로 돌려줘요", () => {
		const points = aggregateVoiceServerHistory([rows[2], rows[0]]);
		expect(points.map((point) => point.time)).toEqual(["2026-10-17 07:43", "2026-10-17 07:44"]);
	});

	it("행이 없으면 빈 시계열이에요", () => {
		expect(aggregateVoiceServerHistory([])).toEqual([]);
	});
});
