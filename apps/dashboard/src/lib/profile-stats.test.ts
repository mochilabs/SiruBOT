// profile-stats 회귀 계약 — 집계 수치와 표본 한도 고지 플래그(listen/rps/guess)를 잠가요.
// DB는 목으로 대체하고 상수 한도(RPS/GUESS_SAMPLE_LIMIT) 경계값으로 sampled 판정을 검증해요.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
	db: {
		user: { findUnique: vi.fn() },
		playlist: { count: vi.fn() },
		guildTrackHistory: { count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
		gameRecord: { findMany: vi.fn(), findFirst: vi.fn() },
		track: { findMany: vi.fn() },
	},
}));
vi.mock("@/lib/data-api/client", () => ({ fetchDataApi: vi.fn() }));

import { db } from "@/lib/db";
import { getProfileStats } from "@/lib/profile-stats";

const USER = "user-profile-stats";

type RpsRecord = { result: string };
type GuessRecord = { meta: unknown };

function trackRow(duration: number) {
	return { createdAt: new Date("2026-10-01T00:00:00Z"), track: { title: "곡", artist: "가수", duration } };
}

/** 상수 한도(RPS 5000 / GUESS 1000 / LISTEN 500)에 딱 맞거나 미달인 모의 집계 */
function mockAggregates(options: { listenCount: number; requestedCount: number; rpsCount: number; guessCount: number }) {
	vi.mocked(db.user.findUnique).mockResolvedValue({ birthMonth: 5, birthDay: 12 } as never);
	vi.mocked(db.playlist.count).mockResolvedValue(7);
	vi.mocked(db.guildTrackHistory.count).mockResolvedValue(options.requestedCount);
	vi.mocked(db.guildTrackHistory.findMany).mockResolvedValue(
		Array.from({ length: options.listenCount }, () => trackRow(60_000)) as never,
	);
	vi.mocked(db.guildTrackHistory.groupBy).mockResolvedValue([] as never);
	vi.mocked(db.gameRecord.findMany).mockImplementation((async (args: { where: { game: string } }) => {
		if (args.where.game === "rps") {
			return Array.from({ length: options.rpsCount }, (_, i): RpsRecord => ({
				result: i % 3 === 2 ? "loss" : "win",
			})) as never;
		}
		return Array.from({ length: options.guessCount }, (_, i): GuessRecord => ({ meta: { attempts: i + 1 } })) as never;
	}) as never);
	vi.mocked(db.gameRecord.findFirst).mockResolvedValue({ meta: { streak: 3, day: "2026-10-20" } } as never);
}

beforeEach(() => {
	vi.mocked(db.user.findUnique).mockReset();
	vi.mocked(db.playlist.count).mockReset();
	vi.mocked(db.guildTrackHistory.count).mockReset();
	vi.mocked(db.guildTrackHistory.findMany).mockReset();
	vi.mocked(db.guildTrackHistory.groupBy).mockReset();
	vi.mocked(db.gameRecord.findMany).mockReset();
	vi.mocked(db.gameRecord.findFirst).mockReset();
});

describe("getProfileStats", () => {
	it("한도 미달이면 집계 수치를 그대로 돌리고 sampled 플래그는 꺼져요", async () => {
		mockAggregates({ listenCount: 3, requestedCount: 3, rpsCount: 3, guessCount: 3 });

		const stats = await getProfileStats(USER);

		expect(stats.birthday.zodiac).not.toBeNull();
		expect(stats.music).toMatchObject({ playlistCount: 7, requestedCount: 3, listenMs: 180_000, listenSampled: false });
		// rps 3건(2승 1패) · 승패 연속은 오래된 기록부터 세면 2연승
		expect(stats.games.rps).toEqual({ wins: 2, losses: 1, draws: 0, bestStreak: 2 });
		expect(stats.games.guessBest).toBe(1);
		expect(stats.games.rpsSampled).toBe(false);
		expect(stats.games.guessSampled).toBe(false);
		expect(stats.attendance).toMatchObject({ streak: 3, lastDay: "2026-10-20" });
	});

	it("표본 한도(RPS 5000 · GUESS 1000)에 걸리면 sampled 플래그가 켜져요", async () => {
		mockAggregates({ listenCount: 3, requestedCount: 9, rpsCount: 5_000, guessCount: 1_000 });

		const stats = await getProfileStats(USER);

		expect(stats.music.listenSampled).toBe(true);
		expect(stats.games.rpsSampled).toBe(true);
		expect(stats.games.guessSampled).toBe(true);
		expect(stats.games.guessBest).toBe(1);
	});
});
