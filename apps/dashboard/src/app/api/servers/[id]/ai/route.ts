import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const MANAGE_GUILD = BigInt(0x20);
const ADMINISTRATOR = BigInt(0x8);
const MODEL_MAX = 100;
const PROMPT_MAX = 1000;

/** 사용자 토큰으로 관리 권한(Manage Guild/Administrator) 확인 */
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

async function authorize(guildId: string): Promise<boolean> {
    const session = await auth();
    if (!session?.accessToken) return false;
    return canManage(session.accessToken, guildId);
}

async function readPolicy(guildId: string) {
    const [guild, historyCount] = await Promise.all([
        db.guild.findUnique({ where: { id: guildId } }),
        db.channelChatHistory.count({ where: { guildId } }),
    ]);
    return {
        enabled: guild?.aiEnabled ?? true,
        model: guild?.aiModel ?? null,
        systemPrompt: guild?.aiSystemPrompt ?? null,
        disabledChannelIds: guild?.aiDisabledChannelIds ?? [],
        historyCount,
    };
}

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    if (!(await authorize(id))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    try {
        return NextResponse.json(await readPolicy(id));
    } catch (error) {
        console.error("Failed to load AI settings:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    if (!(await authorize(id))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const body = (await request.json().catch(() => null)) as {
            enabled?: unknown;
            model?: unknown;
            systemPrompt?: unknown;
        } | null;
        if (!body || typeof body !== "object") {
            return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
        }

        const data: { aiEnabled?: boolean; aiModel?: string | null; aiSystemPrompt?: string | null } = {};

        if (body.enabled !== undefined) {
            if (typeof body.enabled !== "boolean") {
                return NextResponse.json({ error: "enabled는 boolean이어야 해요." }, { status: 400 });
            }
            data.aiEnabled = body.enabled;
        }

        if (body.model !== undefined) {
            if (body.model === null) {
                data.aiModel = null;
            } else if (typeof body.model === "string") {
                const model = body.model.trim();
                if (model.length > MODEL_MAX) {
                    return NextResponse.json({ error: `모델 이름은 ${MODEL_MAX}자 이하여야 해요.` }, { status: 400 });
                }
                data.aiModel = model || null;
            } else {
                return NextResponse.json({ error: "model은 문자열이어야 해요." }, { status: 400 });
            }
        }

        if (body.systemPrompt !== undefined) {
            if (body.systemPrompt === null) {
                data.aiSystemPrompt = null;
            } else if (typeof body.systemPrompt === "string") {
                const prompt = body.systemPrompt.trim();
                if (prompt.length > PROMPT_MAX) {
                    return NextResponse.json({ error: `지침은 ${PROMPT_MAX}자 이하여야 해요.` }, { status: 400 });
                }
                data.aiSystemPrompt = prompt || null;
            } else {
                return NextResponse.json({ error: "systemPrompt는 문자열이어야 해요." }, { status: 400 });
            }
        }

        if (Object.keys(data).length > 0) {
            await db.guild.upsert({
                where: { id },
                create: { id, ...data },
                update: data,
            });
        }

        return NextResponse.json(await readPolicy(id));
    } catch (error) {
        console.error("Failed to update AI settings:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
