import { NextResponse } from "next/server";
import { z } from "zod";

import { createGuildApiHandler } from "@/lib/api-handler";
import { dataApiUserMessage, forwardDataApiGet, forwardDataApiPost } from "@/lib/data-api/client";
import { READ_RATE, WRITE_RATE } from "@/lib/rate-limit";
import type { SocialSubscriptionResponse,SocialSubscriptionsResponse } from "@/types/social";

/** 알림 구독 생성 본문 — 최종 검증은 notifier가 socialSubscriptionCreateSchema로 해요. */
const createSchema = z.object({
  platform: z.enum(["youtube", "chzzk", "twitch"]),
  sourcePlatformId: z.string().trim().min(1).max(200),
  sourceName: z.string().trim().min(1).max(200),
  targetChannelId: z.string().trim().min(1).max(100),
  messageTemplate: z.string().trim().min(1).max(1000).nullable().optional(),
  webhookName: z.string().trim().min(1).max(80).nullable().optional(),
  webhookAvatarUrl: z.string().trim().min(1).max(2048).nullable().optional(),
  showThumbnail: z.boolean().optional(),
});

const LIST_FALLBACK = "알림 구독 목록을 불러오지 못했어요.";
const CREATE_FALLBACK = "알림 구독을 추가하지 못했어요.";

/** 길드 소셜 알림 구독 목록 — notifier 소유 도메인을 data-api 프록시로 그대로 전달해요. */
export const GET = createGuildApiHandler({
  role: "manage",
  rate: READ_RATE,
  key: "social-subscriptions-list",
  handler: async ({ guildId }) => {
    const result = await forwardDataApiGet<SocialSubscriptionsResponse>(
      `/v1/guilds/${guildId}/social/subscriptions`,
    );
    if (!result.ok) {
      return NextResponse.json(
        { error: dataApiUserMessage(result.message, LIST_FALLBACK) },
        { status: result.message ? result.status : 502 },
      );
    }

    return NextResponse.json(result.data);
  },
});

/** 알림 구독 추가 — 봇이 대상 채널에 웹훅을 만들고 notifier가 구독을 저장해요. */
export const POST = createGuildApiHandler({
  role: "manage",
  rate: WRITE_RATE,
  key: "social-subscriptions-create",
  schema: createSchema,
  invalidMessage: "요청 형식이 올바르지 않아요.",
  handler: async ({ guildId, data }) => {
    const result = await forwardDataApiPost<SocialSubscriptionResponse>(
      `/v1/guilds/${guildId}/social/subscriptions`,
      data,
    );
    if (!result.ok) {
      return NextResponse.json(
        { error: dataApiUserMessage(result.message, CREATE_FALLBACK) },
        { status: result.message ? result.status : 502 },
      );
    }

    return NextResponse.json(result.data);
  },
});
