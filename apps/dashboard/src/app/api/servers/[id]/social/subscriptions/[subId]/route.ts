import { NextResponse } from "next/server";
import { z } from "zod";

import { createGuildApiHandler } from "@/lib/api-handler";
import { forwardDataApiGet, forwardDataApiPost } from "@/lib/data-api";
import { WRITE_RATE } from "@/lib/rate-limit";
import type { SocialSubscriptionResponse, SocialSubscriptionsResponse } from "@/types/social";

const idSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

/** 구독 수정 본문 — 템플릿·웹훅 표시·상태 변경이에요. 최종 검증은 notifier가 해요. */
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

/**
 * 구독 소유 검증 — subId가 [id] 길드 소유가 아니면 위임하지 않고 404로 막아요 (IDOR 방지).
 * 길드 스코프 목록 확인에 실패하면 소유를 확인할 수 없으니 502로 열지 않아요(fail-closed).
 */
async function verifySubscriptionOwnership(
  guildId: string,
  subId: string,
): Promise<NextResponse | null> {
  const list = await forwardDataApiGet<SocialSubscriptionsResponse>(
    `/v1/guilds/${guildId}/social/subscriptions`,
  );
  if (!list.ok) {
    return NextResponse.json(
      { error: list.message ?? OWNERSHIP_FALLBACK },
      { status: list.message ? list.status : 502 },
    );
  }
  if (!list.data.subscriptions.some((subscription) => subscription.id === subId)) {
    return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
  }
  return null;
}

/** 알림 구독 수정 — 템플릿 교체·일시정지·재개. */
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
      return NextResponse.json(
        { error: result.message ?? UPDATE_FALLBACK },
        { status: result.message ? result.status : 502 },
      );
    }

    return NextResponse.json(result.data);
  },
});

/** 알림 구독 삭제 — notifier가 구독과 웹훅을 정리해요. */
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
      return NextResponse.json(
        { error: result.message ?? DELETE_FALLBACK },
        { status: result.message ? result.status : 502 },
      );
    }

    return NextResponse.json({ ok: true });
  },
});
