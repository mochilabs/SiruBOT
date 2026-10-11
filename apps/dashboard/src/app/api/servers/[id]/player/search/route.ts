import { NextResponse } from "next/server";
import { z } from "zod";

import { authorizeGuildMember, deniedGuildMember } from "@/lib/api-guards";
import { requestPlayerSearch } from "@/lib/data-api";
import { guardRateLimit, rateKey, WRITE_RATE } from "@/lib/rate-limit";

/**
 * 웹에서 곡 검색 — 검색어와 요청자를 봇에 전달해요.
 * 재생 전제 검증(관리자/DJ 권한, 음성 채널 접속, 채널 충돌)도 봇이 수행해
 * 검색 결과 대신 한국어 안내를 내려주면 그대로 사용자에게 보여줘요.
 */
const searchSchema = z.object({
  query: z.string().trim().min(1).max(200),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authz = await authorizeGuildMember(id);
  if (!authz.ok) return deniedGuildMember(authz);

  const limited = guardRateLimit(rateKey("player-search", authz.userId, id), WRITE_RATE);
  if (limited) return limited;

  const parsed = searchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "검색어는 1~200자까지 입력할 수 있어요." }, { status: 400 });
  }

  const result = await requestPlayerSearch(id, authz.userId, parsed.data.query);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "검색을 처리하지 못했어요." }, { status: result.status });
  }

  return NextResponse.json({ tracks: result.tracks ?? [] });
}