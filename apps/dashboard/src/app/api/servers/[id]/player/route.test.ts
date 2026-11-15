import { beforeEach, describe, expect, it, vi } from "vitest";

const { historyFindMany, historyGroupBy, historyCount, trackFindMany } = vi.hoisted(() => ({
  historyFindMany: vi.fn(), historyGroupBy: vi.fn(), historyCount: vi.fn(), trackFindMany: vi.fn(),
}));
vi.mock("@/lib/api-guards", () => ({
  authorizeDashboardAdmin: vi.fn(),
  authorizeGuildManage: vi.fn(),
  authorizeGuildMember: vi.fn(async () => ({ ok: true, userId: "user", accessToken: "token" })),
  authorizeUser: vi.fn(),
  deniedGuildManage: vi.fn(), deniedGuildMember: vi.fn(), deniedUser: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
  READ_RATE: { limit: 30, windowMs: 60_000 }, WRITE_RATE: { limit: 12, windowMs: 60_000 },
  guardRateLimit: vi.fn(async () => null), rateKey: vi.fn((key: string) => key),
}));
vi.mock("@/lib/db", () => ({ db: {
  guildTrackHistory: { findMany: historyFindMany, groupBy: historyGroupBy, count: historyCount },
  track: { findMany: trackFindMany },
} }));

import { GET } from "./route";

const guildId = "123456789012345678";
const track = { id: "t1", title: "Lemon", artist: "Kenshi Yonezu", duration: 255_000, thumbnail: null, url: "https://x", source: "youtube", totalPlays: 3 };

beforeEach(() => {
  vi.clearAllMocks();
  historyGroupBy.mockResolvedValue([]);
  historyCount.mockResolvedValue(2);
  trackFindMany.mockResolvedValue([]);
});

describe("서버 재생 기록 API", () => {
  it("곡 행을 못 찾은 기록은 건너뛰고 나머지를 돌려줘요", async () => {
    historyFindMany.mockResolvedValue([
      { trackId: "t1", track, createdAt: new Date("2026-11-15T00:00:00Z"), userId: "u1" },
      { trackId: "gone", track: null, createdAt: new Date("2026-11-15T00:01:00Z"), userId: null },
    ]);

    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: guildId }) });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { recent: { id: string }[]; totalPlays: number };
    expect(body.recent.map((r) => r.id)).toEqual(["t1"]);
    expect(body.totalPlays).toBe(2);
  });
});
