import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManage } from "@/lib/guild-permissions";

const MODEL_MAX = 100;
const PROMPT_MAX = 1000;

async function authorize(guildId: string): Promise<{ ok: true } | { ok: false; status: 401 | 403 }> {
    const session = await auth();
    if (!session?.accessToken) return { ok: false, status: 401 };
    if (!(await canManage(session.accessToken, guildId))) return { ok: false, status: 403 };
    return { ok: true };
}

function denied(authz: { ok: false; status: 401 | 403 }) {
    return NextResponse.json(
        { error: authz.status === 401 ? "로그인이 필요해요." : "이 서버를 관리할 권한이 없어요." },
        { status: authz.status }
    );
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
    const authz = await authorize(id);
    if (!authz.ok) return denied(authz);
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
    const authz = await authorize(id);
    if (!authz.ok) return denied(authz);

    try {
        const body = (await request.json().catch(() => null)) as {
            enabled?: unknown;
            model?: unknown;
            systemPrompt?: unknown;
        } | null;
        if (!body || typeof body !== "object") {
            return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
        }

        // 미등록 필드(예: aiDisabledChannelIds)는 조용히 무시하지 말고 알려줘요
        const allowedKeys = new Set(["enabled", "model", "systemPrompt"]);
        const unknownKeys = Object.keys(body).filter((key) => !allowedKeys.has(key));
        if (unknownKeys.length > 0) {
            return NextResponse.json({ error: `지원하지 않는 필드예요: ${unknownKeys.join(", ")}` }, { status: 400 });
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
                // 봇 /채팅설정과 동일하게 "기본"은 env 기본값으로 해석해요
                data.aiModel = model === "기본" ? null : model || null;
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
                data.aiSystemPrompt = prompt === "기본" ? null : prompt || null;
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
