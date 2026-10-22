// 웹 플레이어 request/reply 매핑 계약 — forward*의 실패 상태·한국어 message를
// PlayerWebApiResult로 옮기고, 검색·재생·제어·음성 컨텍스트 요청 본문을 잠가요.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { forwardDataApiGet, forwardDataApiPost } from "./client";
import { fetchPlayerVoiceContext, requestPlayerControl, requestPlayerPlay, requestPlayerSearch } from "./player-web";

vi.mock("./client", () => ({
	forwardDataApiPost: vi.fn(),
	forwardDataApiGet: vi.fn(),
}));

beforeEach(() => {
	vi.clearAllMocks();
});

describe("requestPlayerSearch", () => {
	it("검색 성공 시 tracks·voice를 실어 200으로 돌려줘요", async () => {
		vi.mocked(forwardDataApiPost).mockResolvedValue({
			ok: true,
			data: {
				ok: true,
				tracks: [{ title: "곡", author: "아티스트", durationMs: 1000, artworkUrl: null, uri: "yt:abc", sourceName: "youtube", isStream: false }],
				voice: { inVoice: true, voiceChannelName: "일반", canControl: true },
			},
		});
		await expect(requestPlayerSearch("guild-1", "user-1", "시루")).resolves.toEqual({
			ok: true,
			tracks: [{ title: "곡", author: "아티스트", durationMs: 1000, artworkUrl: null, uri: "yt:abc", sourceName: "youtube", isStream: false }],
			voice: { inVoice: true, voiceChannelName: "일반", canControl: true },
			error: null,
			status: 200,
		});
		expect(forwardDataApiPost).toHaveBeenCalledWith("/v1/internal/player/search", { guildId: "guild-1", userId: "user-1", query: "시루" });
	});

	it("봇이 거절하면 status·한국어 안내를 그대로 옮겨요", async () => {
		vi.mocked(forwardDataApiPost).mockResolvedValue({ ok: false, status: 403, message: "음성 채널에 먼저 접속해 주세요." });
		await expect(requestPlayerSearch("g", "u", "q")).resolves.toEqual({
			ok: false,
			tracks: null,
			voice: null,
			error: "음성 채널에 먼저 접속해 주세요.",
			status: 403,
		});
	});

	it("실패 사유가 없으면 error가 null이에요", async () => {
		vi.mocked(forwardDataApiPost).mockResolvedValue({ ok: false, status: 502, message: null });
		await expect(requestPlayerSearch("g", "u", "q")).resolves.toMatchObject({ ok: false, error: null, status: 502 });
	});
});

describe("requestPlayerPlay", () => {
	it("uri 본문으로 play 경로에 요청해요", async () => {
		vi.mocked(forwardDataApiPost).mockResolvedValue({ ok: true, data: { ok: true, tracks: null, voice: null } });
		await expect(requestPlayerPlay("guild-1", "user-1", "https://youtube.com/watch?v=1")).resolves.toEqual({
			ok: true,
			tracks: null,
			voice: null,
			error: null,
			status: 200,
		});
		expect(forwardDataApiPost).toHaveBeenCalledWith("/v1/internal/player/play", {
			guildId: "guild-1",
			userId: "user-1",
			uri: "https://youtube.com/watch?v=1",
		});
	});
});

describe("requestPlayerControl", () => {
	it("value를 주면 본문에 함께 실어요", async () => {
		vi.mocked(forwardDataApiPost).mockResolvedValue({ ok: true, data: { ok: true, tracks: null, voice: null } });
		await requestPlayerControl("guild-1", "user-1", "volume", 40);
		expect(forwardDataApiPost).toHaveBeenCalledWith("/v1/internal/player/control", {
			guildId: "guild-1",
			userId: "user-1",
			action: "volume",
			value: 40,
		});
	});

	it("value가 없으면 value 키 자체를 보내지 않아요", async () => {
		vi.mocked(forwardDataApiPost).mockResolvedValue({ ok: true, data: { ok: true, tracks: null, voice: null } });
		await requestPlayerControl("guild-1", "user-1", "pause");
		expect(forwardDataApiPost).toHaveBeenCalledWith("/v1/internal/player/control", {
			guildId: "guild-1",
			userId: "user-1",
			action: "pause",
		});
	});
});

describe("fetchPlayerVoiceContext", () => {
	it("userId를 인코딩해 조회하고 voice만 돌려줘요", async () => {
		vi.mocked(forwardDataApiGet).mockResolvedValue({
			ok: true,
			data: { ok: true, voice: { inVoice: true, voiceChannelName: "일반", canControl: false } },
		});
		await expect(fetchPlayerVoiceContext("guild-1", "user 1")).resolves.toEqual({
			ok: true,
			tracks: null,
			voice: { inVoice: true, voiceChannelName: "일반", canControl: false },
			error: null,
			status: 200,
		});
		expect(forwardDataApiGet).toHaveBeenCalledWith("/v1/player/guild-1/voice-context?userId=user%201");
	});

	it("실패 시 status·안내를 그대로 옮겨요", async () => {
		vi.mocked(forwardDataApiGet).mockResolvedValue({ ok: false, status: 503, message: "Redis 장애" });
		await expect(fetchPlayerVoiceContext("g", "u")).resolves.toEqual({
			ok: false,
			tracks: null,
			voice: null,
			error: "Redis 장애",
			status: 503,
		});
	});
});
