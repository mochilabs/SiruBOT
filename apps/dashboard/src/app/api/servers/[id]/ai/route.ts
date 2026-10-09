import { NextResponse } from "next/server";

import { authorizeGuildManage, deniedGuildManage } from "@/lib/api-guards";
import { db } from "@/lib/db";
import { guardRateLimit, rateKey, WRITE_RATE } from "@/lib/rate-limit";
import {
  aiSettingsSchema,
  normalizeAiMode,
  unknownKeys,
  zodError,
} from "@/lib/schemas";

const ALLOWED_KEYS = ["mode", "channelIds"] as const;

async function readPolicy(guildId: string) {
  const [guild, historyCount] = await Promise.all([
    db.guild.findUnique({ where: { id: guildId } }),
    db.channelChatHistory.count({ where: { guildId } }),
  ]);
  return {
    mode: normalizeAiMode(guild?.aiMode),
    channelIds: guild?.aiChannelIds ?? [],
    historyCount,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authz = await authorizeGuildManage(id);
  if (!authz.ok) return deniedGuildManage(authz);
  try {
    return NextResponse.json(await readPolicy(id));
  } catch (error) {
    console.error("Failed to load AI settings:", error);
    return NextResponse.json(
      { error: "요청을 처리하지 못했어요." },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authz = await authorizeGuildManage(id);
  if (!authz.ok) return deniedGuildManage(authz);

  const limited = guardRateLimit(
    rateKey("ai-put", authz.userId, id),
    WRITE_RATE,
  );
  if (limited) return limited;

  try {
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "잘못된 요청이에요." },
        { status: 400 },
      );
    }

    const unknown = unknownKeys(body, ALLOWED_KEYS);
    if (unknown.length > 0) {
      return NextResponse.json(
        { error: `지원하지 않는 필드예요: ${unknown.join(", ")}` },
        { status: 400 },
      );
    }

    const parsed = aiSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: zodError(parsed.error) },
        { status: 400 },
      );
    }

    const data: {
      aiMode?: string;
      aiChannelIds?: string[];
    } = {};
    const input = parsed.data;

    if (input.mode !== undefined) data.aiMode = input.mode;

    if (input.channelIds !== undefined) {
      // 중복 제거 + 목록 보존 순서 유지
      data.aiChannelIds = [...new Set(input.channelIds)];
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
    return NextResponse.json(
      { error: "요청을 처리하지 못했어요." },
      { status: 500 },
    );
  }
}
