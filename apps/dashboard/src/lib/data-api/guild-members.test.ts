// 길드 멤버 표시 정보 조회 계약 — 최대 10명 제한(코어 제약), 빈 목록 단락, 실패 시 null 폴백을 잠가요.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { forwardDataApiGet } from "./client";
import { fetchGuildMembers } from "./guild-members";

vi.mock("./client", () => ({ forwardDataApiGet: vi.fn() }));

beforeEach(() => {
	vi.clearAllMocks();
});

describe("fetchGuildMembers", () => {
	it("빈 목록은 요청 없이 빈 배열을 돌려줘요", async () => {
		await expect(fetchGuildMembers("guild-1", [])).resolves.toEqual([]);
		expect(forwardDataApiGet).not.toHaveBeenCalled();
	});

	it("한 번에 최대 10명까지만, ID를 인코딩해 조회해요", async () => {
		vi.mocked(forwardDataApiGet).mockResolvedValue({ ok: true, data: { members: [{ id: "u1", displayName: "시루", username: "siru", avatarUrl: null }] } });
		const ids = Array.from({ length: 12 }, (_, index) => `user ${index}`);
		const result = await fetchGuildMembers("guild-1", ids);
		expect(result).toEqual([{ id: "u1", displayName: "시루", username: "siru", avatarUrl: null }]);
		expect(forwardDataApiGet).toHaveBeenCalledWith(
			`/v1/guilds/guild-1/members?userIds=${ids
				.slice(0, 10)
				.map((id) => encodeURIComponent(id))
				.join(",")}`,
		);
	});

	it("data-api가 실패하면 사용자 ID 라벨 폴백을 위해 null을 돌려줘요", async () => {
		vi.mocked(forwardDataApiGet).mockResolvedValue({ ok: false, status: 502, message: "봇이 응답하지 않아요." });
		await expect(fetchGuildMembers("guild-1", ["u1"])).resolves.toBeNull();
	});

	it("성공했지만 members가 비어 있으면 빈 배열로 봐요", async () => {
		vi.mocked(forwardDataApiGet).mockResolvedValue({ ok: true, data: {} as { members: [] } });
		await expect(fetchGuildMembers("guild-1", ["u1"])).resolves.toEqual([]);
	});
});
