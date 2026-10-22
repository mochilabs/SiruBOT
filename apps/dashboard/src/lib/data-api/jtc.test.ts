// JTC 마커 채널 셋업 위임 계약 — 성공/마커 없음/봇 거절(한국어 안내)의 매핑을 잠가요.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { forwardDataApiPost } from "./client";
import { requestJtcSetup } from "./jtc";

vi.mock("./client", () => ({ forwardDataApiPost: vi.fn() }));

beforeEach(() => {
	vi.clearAllMocks();
});

describe("requestJtcSetup", () => {
	it("성공한 마커 채널 ID를 실어 200으로 돌려줘요", async () => {
		vi.mocked(forwardDataApiPost).mockResolvedValue({ ok: true, data: { ok: true, markerChannelId: "marker-1" } });
		await expect(requestJtcSetup("guild-1", "user-1", "category-1")).resolves.toEqual({
			ok: true,
			markerChannelId: "marker-1",
			error: null,
			status: 200,
		});
		expect(forwardDataApiPost).toHaveBeenCalledWith("/v1/internal/jtc/setup", {
			guildId: "guild-1",
			userId: "user-1",
			categoryId: "category-1",
		});
	});

	it("봇이 마커를 만들지 못했으면 null이에요", async () => {
		vi.mocked(forwardDataApiPost).mockResolvedValue({ ok: true, data: { ok: true, markerChannelId: null } });
		await expect(requestJtcSetup("g", "u", "c")).resolves.toEqual({
			ok: true,
			markerChannelId: null,
			error: null,
			status: 200,
		});
	});

	it("봇이 거절하면 status·한국어 안내를 그대로 옮겨요", async () => {
		vi.mocked(forwardDataApiPost).mockResolvedValue({ ok: false, status: 403, message: "마커 채널을 만들 권한이 없어요." });
		await expect(requestJtcSetup("g", "u", "c")).resolves.toEqual({
			ok: false,
			markerChannelId: null,
			error: "마커 채널을 만들 권한이 없어요.",
			status: 403,
		});
	});
});
