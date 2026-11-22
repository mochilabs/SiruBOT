import { DEFAULT_BIRTHDAY_CARD } from "@sirubot/utils/birthdayCelebration";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getMock, saveMock } = vi.hoisted(() => ({ getMock: vi.fn(), saveMock: vi.fn() }));
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
vi.mock("@/lib/birthday-celebration", () => {
  class BirthdayRejected extends Error {}
  return { BirthdayRejected, getBirthdaySettings: getMock, saveBirthdaySettings: saveMock };
});

import { BirthdayRejected } from "@/lib/birthday-celebration";

import { GET, PUT } from "./route";

const guildId = "123456789012345678";
const params = { params: Promise.resolve({ id: guildId }) };
const put = (body: unknown) => PUT(new Request("http://localhost", { method: "PUT", body: JSON.stringify(body) }), params);
const valid = { card: DEFAULT_BIRTHDAY_CARD, sendTime: "09:00", roleId: null };

beforeEach(() => vi.clearAllMocks());

describe("생일 축하 설정 API", () => {
  it("저장된 설정을 내려줘요", async () => {
    getMock.mockResolvedValue({ ...valid, activeFrom: null });
    const res = await GET(new Request("http://localhost"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).sendTime).toBe("09:00");
  });

  it("검증을 통과하면 저장해요", async () => {
    saveMock.mockResolvedValue({ ...valid, activeFrom: "2026-11-23" });
    const res = await put(valid);
    expect(res.status).toBe(200);
    expect(saveMock).toHaveBeenCalledWith(guildId, expect.objectContaining({ sendTime: "09:00", roleId: null }));
  });

  it("잘못된 시각·역할 ID·알 수 없는 카드 프리셋은 저장 전에 400이에요", async () => {
    expect((await put({ ...valid, sendTime: "9시" })).status).toBe(400);
    expect((await put({ ...valid, roleId: "abc" })).status).toBe(400);
    const badPreset = structuredClone(valid);
    badPreset.card.image!.background.presetId = "nope";
    expect((await put(badPreset)).status).toBe(400);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("채널 없이 켜는 요청 같은 입력 거절은 400으로 안내해요", async () => {
    saveMock.mockRejectedValueOnce(new BirthdayRejected("축하 메시지를 보낼 채널을 선택해 주세요."));
    const res = await put({ ...valid, card: { ...DEFAULT_BIRTHDAY_CARD, enabled: true } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "축하 메시지를 보낼 채널을 선택해 주세요." });
  });
});
