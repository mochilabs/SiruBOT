import { NextResponse } from "next/server";

import { createGuildApiHandler } from "@/lib/api-handler";
import { notifyGuildSettingsChanged } from "@/lib/data-api";
import { db } from "@/lib/db";
import { READ_RATE, WRITE_RATE } from "@/lib/rate-limit";
import { aiSettingsSchema, normalizeAiMode, parseSettingBody } from "@/lib/schemas";

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

export const GET = createGuildApiHandler({
  role: "manage",
  rate: READ_RATE,
  key: "ai-get",
  handler: async ({ guildId }) => {
    try {
      return NextResponse.json(await readPolicy(guildId));
    } catch (error) {
      console.error("Failed to load AI settings:", error);
      return NextResponse.json(
        { error: "요청을 처리하지 못했어요." },
        { status: 500 },
      );
    }
  },
});

export const PUT = createGuildApiHandler({
  role: "manage",
  rate: WRITE_RATE,
  key: "ai-put",
  handler: async ({ guildId, request }) => {
    try {
      const body = await parseSettingBody(request, aiSettingsSchema, ALLOWED_KEYS);
      if (!body.ok) return body.response;

      const data: {
        aiMode?: string;
        aiChannelIds?: string[];
      } = {};
      const input = body.data;

      if (input.mode !== undefined) data.aiMode = input.mode;

      if (input.channelIds !== undefined) {
        // 중복 제거 + 목록 보존 순서 유지
        data.aiChannelIds = [...new Set(input.channelIds)];
      }

      if (Object.keys(data).length > 0) {
        await db.guild.upsert({
          where: { id: guildId },
          create: { id: guildId, ...data },
          update: data,
        });

        // 저장 성공 후 모든 봇 프로세스의 설정 캐시를 무효화해요 (fire-and-forget).
        // 실패해도 봇은 60초 TTL 폴백으로 결국 최신 설정을 읽으므로 응답을 막지 않아요.
        notifyGuildSettingsChanged(guildId).catch((error) => {
          console.warn(`Failed to notify AI settings change (guild ${guildId}):`, error);
        });
      }

      return NextResponse.json(await readPolicy(guildId));
    } catch (error) {
      console.error("Failed to update AI settings:", error);
      return NextResponse.json(
        { error: "요청을 처리하지 못했어요." },
        { status: 500 },
      );
    }
  },
});
