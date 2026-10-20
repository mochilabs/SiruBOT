import { NextResponse } from "next/server";
import { z } from "zod";

import { authorizeGuildManage, deniedGuildManage } from "@/lib/api-guards";
import { forwardDataApiPost } from "@/lib/data-api";
import { guardRateLimit, rateKey, READ_RATE } from "@/lib/rate-limit";
import type { TwitchResolveResponse } from "@/types/social";

const bodySchema = z.object({
  login: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_]{4,25}$/, "트위치 로그인 아이디 형식이 아니에요."),
});

const FALLBACK = "트위치 사용자를 확인하지 못했어요.";

/** 트위치 로그인 아이디 해석 — 스트리머의 사용자 ID와 표시 이름을 찾아요. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authz = await authorizeGuildManage(id);
  if (!authz.ok) return deniedGuildManage(authz);

  const limited = await guardRateLimit(
    rateKey("social-twitch-resolve", authz.userId, id),
    READ_RATE,
  );
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const result = await forwardDataApiPost<TwitchResolveResponse>(
    `/v1/social/twitch/resolve`,
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