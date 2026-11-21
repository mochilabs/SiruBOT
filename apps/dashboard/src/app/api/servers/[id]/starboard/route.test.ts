import { beforeEach, describe, expect, it, vi } from "vitest";

const { guildUpsert, settingsUpsert, settingsFind, notify } = vi.hoisted(() => ({
  guildUpsert: vi.fn(),
  settingsUpsert: vi.fn(),
  settingsFind: vi.fn(),
  notify: vi.fn(async () => undefined),
}));
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
vi.mock("@/lib/db", () => ({
  db: { guild: { upsert: guildUpsert }, starboardSettings: { upsert: settingsUpsert, findUnique: settingsFind } },
}));
vi.mock("@/lib/data-api/client", () => ({ notifyGuildSettingsChanged: notify }));

import { GET, PUT } from "./route";

const guildId = "123456789012345678";
const params = { params: Promise.resolve({ id: guildId }) };
const put = (body: unknown) => PUT(new Request("http://localhost", { method: "PUT", body: JSON.stringify(body) }), params);

beforeEach(() => {
  vi.clearAllMocks();
  settingsFind.mockResolvedValue(null);
  settingsUpsert.mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({
    channelId: null, emoji: "⭐", threshold: 3, excludeSelf: true, excludeNsfw: true, ignoredChannelIds: [], ...create,
  }));
});

describe("스타보드 설정 API", () => {
  it("행이 없으면 기본값을 내려줘요", async () => {
    const res = await GET(new Request("http://localhost"), params);
    expect(await res.json()).toEqual({ channelId: null, emoji: "⭐", threshold: 3, excludeSelf: true, excludeNsfw: true, ignoredChannelIds: [] });
  });

  it("저장하면 길드 행을 보장하고 설정 무효화를 알려요", async () => {
    const res = await put({ channelId: "223456789012345678", threshold: 5 });
    expect(res.status).toBe(200);
    expect(guildUpsert).toHaveBeenCalled();
    expect(settingsUpsert).toHaveBeenCalledWith(expect.objectContaining({ update: { channelId: "223456789012345678", threshold: 5 } }));
    expect(notify).toHaveBeenCalledWith(guildId);
  });

  it("범위를 벗어난 값과 모르는 필드는 저장 전에 거부해요", async () => {
    expect((await put({ threshold: 0 })).status).toBe(400);
    expect((await put({ threshold: 51 })).status).toBe(400);
    expect((await put({ emoji: "star" })).status).toBe(400);
    expect((await put({ ignoredChannelIds: Array.from({ length: 26 }, () => "223456789012345678") })).status).toBe(400);
    expect((await put({ unknown: 1 })).status).toBe(400);
    expect(settingsUpsert).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
});
