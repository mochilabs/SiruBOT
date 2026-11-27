import { NextResponse } from "next/server";
import { z } from "zod";

import { createGuildApiHandler } from "@/lib/api-handler";
import { dataApiFailResponse, dataApiUserMessage, forwardDataApiGet, forwardDataApiPost } from "@/lib/data-api/client";
import { WRITE_RATE } from "@/lib/rate-limit";
import type { SocialSubscriptionResponse, SocialSubscriptionsResponse } from "@/types/social";

const idSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

const updateSchema = z
  .object({
    messageTemplate: z.string().trim().min(1).max(1000).nullable().optional(),
    status: z.enum(["active", "failed", "disabled"]).optional(),
    webhookName: z.string().trim().min(1).max(80).nullable().optional(),
    webhookAvatarUrl: z.string().trim().min(1).max(2048).nullable().optional(),
    showThumbnail: z.boolean().optional(),
  })
  .refine(
    (body) =>
      body.messageTemplate !== undefined ||
      body.status !== undefined ||
      body.webhookName !== undefined ||
      body.webhookAvatarUrl !== undefined ||
      body.showThumbnail !== undefined,
    {
      message: "변경할 내용이 없어요.",
    },
  );

const UPDATE_FALLBACK = "알림 구독을 수정하지 못했어요.";
const DELETE_FALLBACK = "알림 구독을 삭제하지 못했어요.";
const OWNERSHIP_FALLBACK = "알림 구독을 확인하지 못했어요.";
const NOT_FOUND = "이 서버의 알림 구독을 찾을 수 없어요.";

// subId가 해당 길드 소유가 아니거나 목록 조회 실패 시 위임하지 않아요 (IDOR 방지, fail-closed).
async function verifySubscriptionOwnership(
  guildId: string,
  subId: string,
): Promise<NextResponse | null> {
  const list = await forwardDataApiGet<SocialSubscriptionsResponse>(
    `/v1/guilds/${guildId}/social/subscriptions`,
  );
  if (!list.ok) {
    return dataApiFailResponse({ ...list, message: dataApiUserMessage(list.message, null) }, OWNERSHIP_FALLBACK);
  }
  if (!list.data.subscriptions.some((subscription) => subscription.id === subId)) {
    return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
  }
  return null;
}

export const PATCH = createGuildApiHandler({
  role: "manage",
  rate: WRITE_RATE,
  key: "social-subscriptions-update",
  schema: updateSchema,
  invalidMessage: "요청 형식이 올바르지 않아요.",
  handler: async ({ guildId, params, data }) => {
    const { subId } = params;
    if (!idSchema.safeParse(subId).success) {
      return NextResponse.json({ error: "요청 형식이 올바르지 않아요." }, { status: 400 });
    }

    const ownershipDenied = await verifySubscriptionOwnership(guildId, subId);
    if (ownershipDenied) return ownershipDenied;

    const result = await forwardDataApiPost<SocialSubscriptionResponse>(
      `/v1/guilds/${guildId}/social/subscriptions/${subId}`,
      data,
      { method: "PATCH" },
    );
    if (!result.ok) {
      return dataApiFailResponse({ ...result, message: dataApiUserMessage(result.message, null) }, UPDATE_FALLBACK);
    }

    return NextResponse.json(result.data);
  },
});

export const DELETE = createGuildApiHandler({
  role: "manage",
  rate: WRITE_RATE,
  key: "social-subscriptions-delete",
  handler: async ({ guildId, params }) => {
    const { subId } = params;
    if (!idSchema.safeParse(subId).success) {
      return NextResponse.json({ error: "요청 형식이 올바르지 않아요." }, { status: 400 });
    }

    const ownershipDenied = await verifySubscriptionOwnership(guildId, subId);
    if (ownershipDenied) return ownershipDenied;

    const result = await forwardDataApiPost<{ ok: true }>(
      `/v1/guilds/${guildId}/social/subscriptions/${subId}`,
      undefined,
      { method: "DELETE" },
    );
    if (!result.ok) {
      return dataApiFailResponse({ ...result, message: dataApiUserMessage(result.message, null) }, DELETE_FALLBACK);
    }

    return NextResponse.json({ ok: true });
  },
});
