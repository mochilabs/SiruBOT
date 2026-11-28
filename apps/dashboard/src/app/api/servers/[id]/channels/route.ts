import { NextResponse } from "next/server";
import { guildChannelItemSchema } from "@sirubot/utils/guildData";
import { z } from "zod";

import { createGuildApiHandler } from "@/lib/api-handler";
import { sortChannelsForDisplay } from "@/lib/channel-order";
import { dataApiFailResponse, forwardDataApiGet } from "@/lib/data-api/client";
import { READ_RATE } from "@/lib/rate-limit";
import {
  type DiscordChannelSummary,
  SELECTABLE_CHANNEL_TYPES,
} from "@/types/discord";

const channelsResponseSchema = z.object({
  channels: z.array(guildChannelItemSchema),
});

const CHANNELS_FALLBACK = "봇에서 채널 목록을 불러오지 못했어요.";

export const GET = createGuildApiHandler({
  role: "manage",
  rate: READ_RATE,
  key: "channels-get",
  handler: async ({ guildId }) => {
    const result = await forwardDataApiGet<unknown>(
      `/v1/guilds/${guildId}/channels`,
    );
    if (!result.ok) {
      return dataApiFailResponse(result, CHANNELS_FALLBACK);
    }

    const parsed = channelsResponseSchema.safeParse(result.data);
    if (!parsed.success) {
      console.error("[channels] data-api 응답이 스키마와 맞지 않아요:", parsed.error);
      return NextResponse.json({ error: CHANNELS_FALLBACK }, { status: 502 });
    }

    const allowed = new Set<number>(SELECTABLE_CHANNEL_TYPES);
    const mapped: DiscordChannelSummary[] = parsed.data.channels
      .filter((channel) => allowed.has(channel.type))
      .map((channel) => ({
        id: channel.id,
        name: channel.name || "이름 없는 채널",
        type: channel.type,
        parentId: channel.parentId,
        position: channel.position,
      }));
    const channels = sortChannelsForDisplay(mapped);

    return NextResponse.json({ channels });
  },
});
