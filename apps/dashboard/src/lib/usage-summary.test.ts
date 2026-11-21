import { describe, expect, it } from "vitest";

import { summarizeActivation, summarizeModules, summarizePlayback } from "./usage-summary";

const at = (h: number) => new Date(Date.UTC(2026, 10, 1, h));

describe("summarizeActivation", () => {
	it("24시간 안에 처음 쓴 서버 비율을 계산해요", () => {
		const summary = summarizeActivation([
			{ joinedAt: at(0), firstUseAt: at(1), leftAt: null },
			{ joinedAt: at(0), firstUseAt: at(30), leftAt: null },
			{ joinedAt: at(0), firstUseAt: null, leftAt: at(2) },
			{ joinedAt: at(0), firstUseAt: at(24), leftAt: null },
		]);
		expect(summary).toEqual({ joined: 4, activated: 2, stillIn: 3, rate: 0.5 });
	});

	it("들어온 서버가 없으면 비율은 null이에요", () => {
		expect(summarizeActivation([]).rate).toBeNull();
	});
});

describe("summarizeModules", () => {
	it("서버를 모듈별로 한 번만 세고 횟수는 더해요", () => {
		const modules = summarizeModules([
			{ guildId: "g1", feature: "cmd:play", count: 3 },
			{ guildId: "g1", feature: "ns:controller", count: 2 },
			{ guildId: "g2", feature: "msg:music-channel", count: 1 },
			{ guildId: "g1", feature: "msg:ai-mention", count: 5 },
			{ guildId: "g3", feature: "playback:track_error", count: 9 },
			{ guildId: "g3", feature: "onboarding:sent", count: 1 },
			{ guildId: "g4", feature: "cmd:unknown", count: 1 },
		]);
		const byId = Object.fromEntries(modules.map((m) => [m.id, m]));
		expect(byId.music).toMatchObject({ activeGuilds: 2, uses: 6 });
		expect(byId.ai).toMatchObject({ activeGuilds: 1, uses: 5 });
		expect(byId.utility).toMatchObject({ activeGuilds: 0, uses: 0 });
		expect(modules.map((m) => m.id)).toEqual(["music", "community", "ai", "fun", "utility", "admin"]);
	});
});

describe("summarizePlayback", () => {
	it("재생 이벤트만 유형별로 합쳐 많은 순서로 줘요", () => {
		expect(
			summarizePlayback([
				{ guildId: "g1", feature: "playback:track_start", count: 10 },
				{ guildId: "g2", feature: "playback:track_start", count: 5 },
				{ guildId: "g1", feature: "playback:track_error", count: 2 },
				{ guildId: "g1", feature: "cmd:play", count: 99 },
			]),
		).toEqual([
			{ type: "track_start", count: 15 },
			{ type: "track_error", count: 2 },
		]);
	});
});
