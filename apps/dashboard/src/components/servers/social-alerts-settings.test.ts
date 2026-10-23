import { describe, expect, it } from "vitest";

import { SAMPLE_URLS } from "@/components/servers/social/template-editor";
import type { SocialPlatform, SocialSubscription } from "@/types/social";

import { sampleFor } from "./social-alerts-settings";

function subscription(platform: SocialPlatform): SocialSubscription {
  return {
    id: "sub-1",
    guildId: "guild-1",
    platform,
    sourcePlatformId: "source-1",
    sourceName: "시루 채널",
    targetChannelId: "channel-1",
    messageTemplate: null,
    webhookName: null,
    webhookAvatarUrl: null,
    showThumbnail: true,
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("sampleFor", () => {
  it("플랫폼별 미리보기 URL은 자리 표시 값을 쓰고 제목·작성자는 실제 소스 값을 써요", () => {
    const youtube = sampleFor(subscription("youtube"));
    expect(youtube.url).toBe(SAMPLE_URLS.youtube);
    expect(youtube.title).toBe("새 영상 제목");
    expect(youtube.author).toBe("시루 채널");
    expect(youtube.sourceId).toBe("source-1");

    const twitch = sampleFor(subscription("twitch"));
    expect(twitch.url).toBe(SAMPLE_URLS.twitch);
    expect(twitch.title).toBe("시루 채널 방송 시작!");

    const chzzk = sampleFor(subscription("chzzk"));
    expect(chzzk.url).toBe(SAMPLE_URLS.chzzk);
    expect(chzzk.title).toBe("시루 채널 방송 시작!");
  });
});
