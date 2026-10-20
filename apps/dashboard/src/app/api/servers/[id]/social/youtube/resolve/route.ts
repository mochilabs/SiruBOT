import { NextResponse } from "next/server";
import { z } from "zod";

import { authorizeGuildManage, deniedGuildManage } from "@/lib/api-guards";
import { forwardDataApiPost } from "@/lib/data-api";
import { guardRateLimit, rateKey, READ_RATE } from "@/lib/rate-limit";
import type { YouTubeResolveResponse } from "@/types/social";

const bodySchema = z.object({
  input: z.string().trim().min(1).max(200),
});

const FALLBACK = "유튜브 채널을 확인하지 못했어요.";

/** 유튜브 채널 해석 — URL·@핸들·UC 채널 ID를 채널 ID와 이름으로 바꿔요. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authz = await authorizeGuildManage(id);
  if (!authz.ok) return deniedGuildManage(authz);

  const limited = await guardRateLimit(
    rateKey("social-youtube-resolve", authz.userId, id),
    READ_RATE,
  );
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const result = await forwardDataApiPost<YouTubeResolveResponse>(
    `/v1/social/youtube/resolve`,
    parsed.data,
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.message ?? FALLBACK },
      { status: result.message ? result.status : 502 },
    );
  }

  return NextResponse.json(result.data);
}