import { beforeEach, describe, expect, it, vi } from "vitest";

const { upsert, findUnique, notify } = vi.hoisted(() => ({
  upsert: vi.fn(), findUnique: vi.fn(), notify: vi.fn(async () => undefined),
}));
vi.mock("@/lib/api-guards", () => ({
  authorizeDashboardAdmin: vi.fn(async () => ({ ok: true, userId: "admin" })),
  authorizeGuildManage: vi.fn(async () => ({ ok: true, userId: "user", accessToken: "token" })),
  authorizeGuildMember: vi.fn(), authorizeUser: vi.fn(),
  deniedGuildManage: vi.fn(), deniedGuildMember: vi.fn(), deniedUser: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
  READ_RATE: { limit: 30, windowMs: 60_000 }, WRITE_RATE: { limit: 12, windowMs: 60_000 },
  guardRateLimit: vi.fn(async () => null), rateKey: vi.fn((key: string) => key),
}));
vi.mock("@/lib/db", () => ({ db: {
  guild: { upsert, findUnique }, channelChatHistory: { count: vi.fn(async () => 0) },
  socialSubscription: { count: vi.fn(async () => 0) },
} }));
vi.mock("@/lib/data-api/client", () => ({ notifyGuildSettingsChanged: notify }));

import { PATCH } from "../../../admin/guilds/[id]/route";

import { PUT } from "./route";

beforeEach(() => { vi.clearAllMocks(); findUnique.mockResolvedValue(null); });
const guildId = "123456789012345678";

describe.each([{ name: "서버", handler: PUT, method: "PUT" }, { name: "관리자", handler: PATCH, method: "PATCH" }])("$name AutoMix API", ({ handler, method }) => {
  async function update(body: unknown) {
    return handler(new Request("http://localhost", { method, body: JSON.stringify(body) }), {
      params: Promise.resolve({ id: guildId }),
    });
  }
  it("AutoMix 활성화와 크로스페이드를 한 번에 저장하고 재생 설정을 갱신해요", async () => {
    expect((await update({ automixEnabled: true, automixMaxTempoChange: 0.07 })).status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ automixEnabled: true, crossfadeEnabled: true }),
      update: expect.objectContaining({ automixEnabled: true, crossfadeEnabled: true, automixMaxTempoChange: 0.07 }),
    }));
    expect(notify).toHaveBeenCalledWith(guildId, "mixer");
  });
  it("크로스페이드를 끄면 AutoMix도 같은 쓰기에서 꺼요", async () => {
    expect((await update({ crossfadeEnabled: false })).status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ crossfadeEnabled: false, automixEnabled: false }) }));
  });
  it("신뢰도만 바꿔도 재생 설정을 갱신해요", async () => {
    expect((await update({ automixMinConfidence: 0.5 })).status).toBe(200);
    expect(notify).toHaveBeenCalledWith(guildId, "mixer");
  });
  it("잘못된 범위는 저장 전에 거부해요", async () => {
    expect((await update({ automixMaxTempoChange: 12 })).status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
});
