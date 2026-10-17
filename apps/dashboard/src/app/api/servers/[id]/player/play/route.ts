import { NextResponse } from "next/server";
import { playerWebPlayUriSchema } from "@sirubot/utils";
import { z } from "zod";

import { authorizeGuildMember, deniedGuildMember } from "@/lib/api-guards";
import { requestPlayerPlay } from "@/lib/data-api";
import { guardRateLimit, rateKey, WRITE_RATE } from "@/lib/rate-limit";

/**
 * 곡 재생 요청 — 검색 결과의 uri(다시 재생 URL 포함)을 봇에 전달해요.
 * 봇은 요청자의 음성 채널로 접속하고 트랙을 큐에 넣어 재생을 보장해요.
 * 검증 실패(음성 미접속·권한 없음·채널 충돌 등) 시 한국어 안내를 그대로 내려줘요.
 * uri는 공용 계약 스키마(http/https 전용)로 검증해요 — 다른 스킴은 내부 fetch(SSRF)로 이어질 수 있어요.
 */
const playSchema = z.object({
  uri: playerWebPlayUriSchema,
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authz = await authorizeGuildMember(id);
  if (!authz.ok) return deniedGuildMember(authz);

  const limited = await guardRateLimit(rateKey("player-play", authz.userId, id), WRITE_RATE);
  if (limited) return limited;

  const parsed = playSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "재생할 곡 주소 형식이 올바르지 않아요." }, { status: 400 });
  }

  const result = await requestPlayerPlay(id, authz.userId, parsed.data.uri);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "재생을 시작하지 못했어요." }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}
