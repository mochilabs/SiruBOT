import { NextResponse } from "next/server";

import { authorizeGuildMember, deniedGuildMember } from "@/lib/api-guards";
import { fetchPlayerVoiceContext } from "@/lib/data-api";
import { guardRateLimit, rateKey, READ_RATE } from "@/lib/rate-limit";

/**
 * 요청자 음성·권한 상태 — player 페이지의 배지와 재생 UI 활성화에 써요.
 * OAuth로는 사용자의 음성 채널·DJ 권한을 알 수 없으므로 봇이 userId로 해석해 내려줘요.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authz = await authorizeGuildMember(id);
  if (!authz.ok) return deniedGuildMember(authz);

  const limited = guardRateLimit(rateKey("voice-context", authz.userId, id), READ_RATE);
  if (limited) return limited;

  const result = await fetchPlayerVoiceContext(id, authz.userId);
  if (!result.ok || !result.voice) {
    return NextResponse.json(
      { error: result.error ?? "음성 상태를 확인하지 못했어요." },
      { status: result.ok ? 502 : result.status },
    );
  }

  return NextResponse.json({ voice: result.voice });
}