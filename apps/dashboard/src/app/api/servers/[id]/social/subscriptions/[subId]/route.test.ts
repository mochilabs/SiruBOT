// 소셜 알림 구독 [subId] 라우트 회귀 계약 — upstream(data-api)의 기술 메시지
// ("Route DELETE:/v1/... not found")가 사용자에게 새지 않고 한국어 폴백으로 바뀌며,
// 소유 검증에 실패하면 삭제를 위임하지 않는 것을 잠가요.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { forwardGet, forwardPost } = vi.hoisted(() => ({
	forwardGet: vi.fn(),
	forwardPost: vi.fn(),
}));

vi.mock("@/lib/api-guards", () => ({
	authorizeDashboardAdmin: vi.fn(),
	authorizeGuildManage: vi.fn(async () => ({ ok: true, userId: "user-1", accessToken: "token" })),
	authorizeGuildMember: vi.fn(),
	authorizeUser: vi.fn(),
	deniedGuildManage: vi.fn(),
	deniedGuildMember: vi.fn(),
	deniedUser: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
	READ_RATE: { limit: 30, windowMs: 60_000 },
	WRITE_RATE: { limit: 12, windowMs: 60_000 },
	guardRateLimit: vi.fn(async () => null),
	rateKey: vi.fn((key: string) => key),
}));

vi.mock("@/lib/data-api/client", async (importOriginal) => {
	// 검증 로직(dataApiUserMessage)은 실제를 쓰고 위임 함수만 스텁으로 바꿔요
	const actual = await importOriginal<typeof import("@/lib/data-api/client")>();
	return {
		...actual,
		forwardDataApiGet: (...args: unknown[]) => forwardGet(...args),
		forwardDataApiPost: (...args: unknown[]) => forwardPost(...args),
	};
});

import { DELETE } from "./route";

const GUILD_ID = "guild-1";
const SUB_ID = "3f1a2b4c-1111-4222-8333-444455556666";

function callDelete(): Promise<Response> {
	return DELETE(
		new Request(`http://localhost/api/servers/${GUILD_ID}/social/subscriptions/${SUB_ID}`, { method: "DELETE" }),
		{ params: Promise.resolve({ id: GUILD_ID, subId: SUB_ID }) },
	);
}

/** 소유 목록 확인 성공 — 길드가 구독을 실제로 소유한 상태를 만드는 헬퍼예요. */
function listOwned() {
	forwardGet.mockResolvedValueOnce({ ok: true, data: { subscriptions: [{ id: SUB_ID }] } });
}

beforeEach(() => {
	forwardGet.mockReset();
	forwardPost.mockReset();
});

describe("DELETE 소셜 알림 구독 라우트", () => {
	it("upstream이 Fastify 기술 메시지(404)를 주면 상태는 유지하고 한국어 폴백으로 바꿔요", async () => {
		listOwned();
		forwardPost.mockResolvedValueOnce({
			ok: false,
			status: 404,
			message: `Route DELETE:/v1/guilds/${GUILD_ID}/social/subscriptions/${SUB_ID} not found`,
		});

		const res = await callDelete();
		expect(res.status).toBe(404);
		await expect(res.json()).resolves.toEqual({ error: "알림 구독을 삭제하지 못했어요." });
	});

	it("upstream의 한국어 안내 메시지는 그대로 전달해요", async () => {
		listOwned();
		forwardPost.mockResolvedValueOnce({ ok: false, status: 400, message: "웹훅이 삭제된 채널이라 알림을 정리하지 못했어요." });

		const res = await callDelete();
		expect(res.status).toBe(400);
		await expect(res.json()).resolves.toEqual({ error: "웹훅이 삭제된 채널이라 알림을 정리하지 못했어요." });
	});

	it("소유 목록 확인이 기술 메시지로 실패하면 위임하지 않고 한국어 안내로 막아요", async () => {
		forwardGet.mockResolvedValueOnce({
			ok: false,
			status: 404,
			message: `Route GET:/v1/guilds/${GUILD_ID}/social/subscriptions not found`,
		});

		const res = await callDelete();
		expect(res.status).toBe(404);
		await expect(res.json()).resolves.toEqual({ error: "알림 구독을 확인하지 못했어요." });
		expect(forwardPost).not.toHaveBeenCalled();
	});

	it("소유하지 않은 구독은 삭제를 위임하지 않고 404로 막아요", async () => {
		forwardGet.mockResolvedValueOnce({ ok: true, data: { subscriptions: [{ id: "9e8d7c6b-aaaa-4bbb-8ccc-ddddeeeeffff" }] } });

		const res = await callDelete();
		expect(res.status).toBe(404);
		await expect(res.json()).resolves.toEqual({ error: "이 서버의 알림 구독을 찾을 수 없어요." });
		expect(forwardPost).not.toHaveBeenCalled();
	});

	it("삭제 성공 경로는 DELETE 위임 후 ok를 돌려줘요", async () => {
		listOwned();
		forwardPost.mockResolvedValueOnce({ ok: true, data: { ok: true } });

		const res = await callDelete();
		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ ok: true });
		expect(forwardPost).toHaveBeenCalledWith(`/v1/guilds/${GUILD_ID}/social/subscriptions/${SUB_ID}`, undefined, { method: "DELETE" });
	});
});
