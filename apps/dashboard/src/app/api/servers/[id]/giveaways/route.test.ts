import { beforeEach, describe, expect, it, vi } from "vitest";

const { listMock } = vi.hoisted(() => ({ listMock: vi.fn() }));
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
vi.mock("@/lib/giveaways", () => ({ listGiveaways: listMock }));

import { GET } from "./route";

const params = { params: Promise.resolve({ id: "123456789012345678" }) };

beforeEach(() => vi.clearAllMocks());

describe("기브어웨이 API", () => {
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
});
