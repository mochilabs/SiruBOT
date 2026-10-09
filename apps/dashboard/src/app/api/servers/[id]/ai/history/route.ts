import { NextResponse } from "next/server";

import { authorizeGuildManage, deniedGuildManage } from "@/lib/api-guards";
import { db } from "@/lib/db";
import { guardRateLimit, rateKey, WRITE_RATE } from "@/lib/rate-limit";

/** 이 서버의 AI 대화 기록을 모두 삭제해요 (봇 캐시는 다음 턴에 자동으로 DB와 동기화) */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authz = await authorizeGuildManage(id);
  if (!authz.ok) return deniedGuildManage(authz);

  const limited = guardRateLimit(
    rateKey("ai-history-delete", authz.userId, id),
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
