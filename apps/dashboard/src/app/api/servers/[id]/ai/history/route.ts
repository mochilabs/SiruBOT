import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManage } from "@/lib/guild-permissions";

/** 이 서버의 AI 대화 기록을 모두 삭제해요 (봇 캐시는 다음 턴에 자동으로 DB와 동기화) */
export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const session = await auth();
    if (!session?.accessToken) {
        return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
    }
    if (!(await canManage(session.accessToken, id))) {
        return NextResponse.json({ error: "이 서버를 관리할 권한이 없어요." }, { status: 403 });
    }

    try {
        const result = await db.channelChatHistory.deleteMany({ where: { guildId: id } });
        return NextResponse.json({ deleted: result.count });
    } catch (error) {
        console.error("Failed to delete chat history:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
