import { beforeEach, describe, expect, it, vi } from "vitest";

const { listMock, manageMock } = vi.hoisted(() => ({ listMock: vi.fn(), manageMock: vi.fn() }));
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
vi.mock("@/lib/giveaways", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/giveaways")>()),
  listGiveaways: listMock,
}));
vi.mock("@/lib/data-api/giveaway", () => ({ requestGiveawayManage: manageMock }));

import { GET, POST } from "./route";

const params = { params: Promise.resolve({ id: "123456789012345678" }) };

beforeEach(() => vi.clearAllMocks());

describe("나눔 API", () => {
  it("진행 중·지난 목록을 내려줘요", async () => {
    listMock.mockResolvedValue({ running: [], past: [] });
    const res = await GET(new Request("http://localhost"), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ running: [], past: [] });
    expect(listMock).toHaveBeenCalledWith("123456789012345678");
  });

  it("조회가 실패하면 500이에요", async () => {
    listMock.mockRejectedValue(new Error("db"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await GET(new Request("http://localhost"), params)).status).toBe(500);
  });

  const post = (body: unknown) =>
    POST(new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), params);
  const endsAt = () => new Date(Date.now() + 9 * 60 * 60_000 + 2 * 60 * 60_000).toISOString().slice(0, 16).replace("T", " ");
  const valid = () => ({ channelId: "123456789012345679", prize: "기프티콘", winnerCount: 2, endsAt: endsAt(), conditions: [{ type: "minJoinDays", days: 7 }] });

  it("나눔을 시작하면 봇에 위임하고 ISO 마감 시각을 넘겨요", async () => {
    manageMock.mockResolvedValue({ ok: true, giveawayId: "g1", winnerIds: [], error: null, status: 200 });
    const res = await post(valid());
    expect(res.status).toBe(201);
    expect(manageMock).toHaveBeenCalledWith(
      "123456789012345678",
      "user",
      expect.objectContaining({ action: "start", prize: "기프티콘", winnerCount: 2, endsAt: expect.stringMatching(/Z$/) }),
    );
  });

  it("봇이 거부하면 사유와 상태를 그대로 내려줘요", async () => {
    manageMock.mockResolvedValue({ ok: false, giveawayId: null, winnerIds: [], error: "진행 중인 나눔은 서버당 최대 10개예요.", status: 400 });
    const res = await post(valid());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "진행 중인 나눔은 서버당 최대 10개예요." });
  });

  it("마감이 너무 가깝거나 입력이 틀리면 봇에 보내지 않아요", async () => {
    const soon = new Date(Date.now() + 9 * 60 * 60_000 + 10_000).toISOString().slice(0, 16).replace("T", " ");
    expect((await post({ ...valid(), endsAt: soon })).status).toBe(400);
    expect((await post({ ...valid(), prize: "" })).status).toBe(400);
    expect((await post({ ...valid(), winnerCount: 0 })).status).toBe(400);
    expect(manageMock).not.toHaveBeenCalled();
  });
});
