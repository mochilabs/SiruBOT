import { NextResponse } from "next/server";
import { createScheduledMessageSchema } from "@sirubot/utils/scheduledMessage";

import { createGuildApiHandler } from "@/lib/api-handler";
import { READ_RATE, WRITE_RATE } from "@/lib/rate-limit";
import {
  createScheduledMessage,
  getScheduledMessageSettings,
  listScheduledMessages,
  ScheduledMessageRejected,
} from "@/lib/scheduled-messages";

export const GET = createGuildApiHandler({
  role: "manage",
  rate: READ_RATE,
  key: "scheduled-messages-get",
  handler: async ({ guildId }) => {
    try {
      const [items, settings] = await Promise.all([
        listScheduledMessages(guildId),
        getScheduledMessageSettings(guildId),
      ]);
      return NextResponse.json({ items, settings });
    } catch (error) {
      console.error("Failed to load scheduled messages:", error);
      return NextResponse.json({ error: "요청을 처리하지 못했어요." }, { status: 500 });
    }
  },
});

export const POST = createGuildApiHandler({
  role: "manage",
  rate: WRITE_RATE,
  key: "scheduled-messages-post",
  schema: createScheduledMessageSchema,
  handler: async ({ guildId, authz, data }) => {
    try {
      const item = await createScheduledMessage(guildId, authz.userId, data);
      return NextResponse.json(item, { status: 201 });
    } catch (error) {
      if (error instanceof ScheduledMessageRejected) {
        const status = error.code === "limit" || error.code === "interval" ? 409 : 400;
        return NextResponse.json({ error: error.message }, { status });
      }
      console.error("Failed to create scheduled message:", error);
      return NextResponse.json({ error: "요청을 처리하지 못했어요." }, { status: 500 });
    }
  },
});
