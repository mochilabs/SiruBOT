import { beforeEach, describe, expect, it, vi } from "vitest";

const { manageMock } = vi.hoisted(() => ({ manageMock: vi.fn() }));
vi.mock("@/lib/api-guards", () => ({
  authorizeDashboardAdmin: vi.fn(),
  authorizeGuildManage: vi.fn(async () => ({ ok: true, userId: "user", accessToken: "token" })),
  authorizeGuildMember: vi.fn(), authorizeUser: vi.fn(),
  deniedGuildManage: vi.fn(), deniedGuildMember: vi.fn(), deniedUser: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
  READ_RATE: { limit: 30, windowMs: 60_000 }, WRITE_RATE: { limit: 12, windowMs: 60_000 },
  guardRateLimit: vi.fn(async () => null), rateKey: vi.fn((key: string) => key),
}));
vi.mock("@/lib/data-api/giveaway", () => ({ requestGiveawayManage: manageMock }));

import { POST } from "./route";

const params = { params: Promise.resolve({ id: "123456789012345678", giveawayId: "g1" }) };
const post = (body: unknown) =>
  POST(new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), params);

beforeEach(() => vi.clearAllMocks());

describe("나눔 종료·취소·다시 뽑기 API", () => {
  it("종료와 취소는 나눔 ID만 넘겨요", async () => {
    manageMock.mockResolvedValue({ ok: true, giveawayId: "g1", winnerIds: [], error: null, status: 200 });
    expect((await post({ action: "end" })).status).toBe(200);
    expect(manageMock).toHaveBeenLastCalledWith("123456789012345678", "user", { action: "end", giveawayId: "g1" });
    expect((await post({ action: "cancel" })).status).toBe(200);
    expect(manageMock).toHaveBeenLastCalledWith("123456789012345678", "user", { action: "cancel", giveawayId: "g1" });
  });

  it("다시 뽑기는 인원을 넘기고 새 당첨자를 내려줘요", async () => {
    manageMock.mockResolvedValue({ ok: true, giveawayId: "g1", winnerIds: ["123456789012345679"], error: null, status: 200 });
    const res = await post({ action: "reroll", count: 2 });
    expect(await res.json()).toEqual({ ok: true, winnerIds: ["123456789012345679"] });
    expect(manageMock).toHaveBeenCalledWith("123456789012345678", "user", { action: "reroll", giveawayId: "g1", count: 2 });
  });

  it("알 수 없는 동작이나 잘못된 인원은 400이고 봇이 거부하면 사유를 내려줘요", async () => {
    expect((await post({ action: "delete" })).status).toBe(400);
    expect((await post({ action: "reroll", count: 99 })).status).toBe(400);
    expect(manageMock).not.toHaveBeenCalled();
    manageMock.mockResolvedValue({ ok: false, giveawayId: null, winnerIds: [], error: "진행 중인 그 나눔을 찾지 못했어요.", status: 400 });
    const res = await post({ action: "cancel" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "진행 중인 그 나눔을 찾지 못했어요." });
  });
});
