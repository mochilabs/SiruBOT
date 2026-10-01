import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const MANAGE_GUILD = BigInt(0x20);
const ADMINISTRATOR = BigInt(0x8);

async function canManage(accessToken: string, guildId: string): Promise<boolean> {
    try {
        const res = await fetch("https://discord.com/api/v10/users/@me/guilds", {
            headers: { Authorization: `Bearer ${accessToken}` },
            cache: "no-store",
        });
        if (!res.ok) return false;
        const guilds: Array<{ id: string; permissions: string | number }> = await res.json();
        const guild = guilds.find((g) => g.id === guildId);
        if (!guild) return false;
        const permissions = BigInt(guild.permissions);
        return (permissions & MANAGE_GUILD) === MANAGE_GUILD || (permissions & ADMINISTRATOR) === ADMINISTRATOR;
    } catch {
        return false;
    }
}

/** 이 서버의 AI 대화 기록을 모두 삭제해요 (봇 캐시는 다음 턴에 자동으로 DB와 동기화) */
export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const session = await auth();
    if (!session?.accessToken || !(await canManage(session.accessToken, id))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const result = await db.channelChatHistory.deleteMany({ where: { guildId: id } });
        return NextResponse.json({ deleted: result.count });
    } catch (error) {
        console.error("Failed to delete chat history:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
