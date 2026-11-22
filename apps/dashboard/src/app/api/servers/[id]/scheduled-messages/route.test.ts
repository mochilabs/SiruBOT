import { beforeEach, describe, expect, it, vi } from "vitest";

const { createMock, listMock, settingsMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  listMock: vi.fn(),
  settingsMock: vi.fn(),
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
vi.mock("@/lib/scheduled-messages", () => {
  class ScheduledMessageRejected extends Error {
    constructor(message: string, public readonly code: string) {
      super(message);
    }
  }
  return {
    ScheduledMessageRejected,
    createScheduledMessage: createMock,
    listScheduledMessages: listMock,
    getScheduledMessageSettings: settingsMock,
  };
});

import { ScheduledMessageRejected } from "@/lib/scheduled-messages";

import { GET, POST } from "./route";

const guildId = "123456789012345678";
const params = { params: Promise.resolve({ id: guildId }) };
const post = (body: unknown) => POST(new Request("http://localhost", { method: "POST", body: JSON.stringify(body) }), params);
const valid = { channelId: "223456789012345678", content: "안녕하세요", runAt: "2026-12-25 09:00", repeat: "none" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("예약 메시지 API", () => {
  it("목록과 서버 설정을 함께 내려줘요", async () => {
    listMock.mockResolvedValue([]);
    settingsMock.mockResolvedValue({ maxActive: 25, minIntervalMinutes: 10 });
    const res = await GET(new Request("http://localhost"), params);
    expect(await res.json()).toEqual({ items: [], settings: { maxActive: 25, minIntervalMinutes: 10 } });
  });

  it("검증을 통과하면 만든 사람과 함께 저장해요", async () => {
    createMock.mockResolvedValue({ seriesId: "s" });
    const res = await post(valid);
    expect(res.status).toBe(201);
    expect(createMock).toHaveBeenCalledWith(guildId, "user", valid);
  });

  it("@everyone, 빈 본문, 2000자 초과, 잘못된 일시·반복은 저장 전에 400이에요", async () => {
    expect((await post({ ...valid, content: "@everyone 모여" })).status).toBe(400);
    expect((await post({ ...valid, content: "   " })).status).toBe(400);
    expect((await post({ ...valid, content: "가".repeat(2001) })).status).toBe(400);
    expect((await post({ ...valid, runAt: "내일 9시" })).status).toBe(400);
    expect((await post({ ...valid, repeat: "hourly" })).status).toBe(400);
    expect((await post({ ...valid, extra: 1 })).status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("상한·간격 초과는 409, 시각 문제는 400으로 안내해요", async () => {
    createMock.mockRejectedValueOnce(new ScheduledMessageRejected("활성 예약은 최대 25개예요.", "limit"));
    const limited = await post(valid);
    expect(limited.status).toBe(409);
    expect(await limited.json()).toEqual({ error: "활성 예약은 최대 25개예요." });
    createMock.mockRejectedValueOnce(new ScheduledMessageRejected("1분 뒤 이후", "past"));
    expect((await post(valid)).status).toBe(400);
  });
});
