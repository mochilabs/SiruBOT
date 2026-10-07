import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManage } from "@/lib/guild-permissions";
import { guardRateLimit, rateKey, WRITE_RATE } from "@/lib/rate-limit";
import { getSessionAccessToken } from "@/lib/session-token";

/** 이 서버의 AI 대화 기록을 모두 삭제해요 (봇 캐시는 다음 턴에 자동으로 DB와 동기화) */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }

  const accessToken = await getSessionAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }
  if (!(await canManage(accessToken, id))) {
    return NextResponse.json(
      { error: "이 서버를 관리할 권한이 없어요." },
      { status: 403 },
    );
  }

  const limited = guardRateLimit(
    rateKey("ai-history-delete", session.user.id, id),
    WRITE_RATE,
  );
  if (limited) return limited;

  try {
    const result = await db.channelChatHistory.deleteMany({
      where: { guildId: id },
    });
    return NextResponse.json({ deleted: result.count });
  } catch (error) {
    console.error("Failed to delete chat history:", error);
    return NextResponse.json(
      { error: "요청을 처리하지 못했어요." },
      { status: 500 },
    );
  }
}
