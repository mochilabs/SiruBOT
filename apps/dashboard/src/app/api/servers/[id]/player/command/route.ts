import { NextResponse } from "next/server";
import {
  PLAYER_WEB_SEEK_MAX_MS,
  playerWebControlActionSchema,
} from "@sirubot/utils/playerWeb";
import { z } from "zod";

import { createGuildApiHandler } from "@/lib/api-handler";
import { requestPlayerControl } from "@/lib/data-api/player-web";
import { WRITE_RATE } from "@/lib/rate-limit";

const commandSchema = z
  .object({
    action: playerWebControlActionSchema,
    value: z.number().int().min(0).max(150).optional(),
    index: z.number().int().min(0).max(999).optional(),
    from: z.number().int().min(0).max(999).optional(),
    to: z.number().int().min(0).max(999).optional(),
    positionMs: z.number().int().min(0).max(PLAYER_WEB_SEEK_MAX_MS).optional(),
  })
  .superRefine((body, ctx) => {
    if (body.action === "volume" && typeof body.value !== "number") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "volume 제어에는 value(0~150)가 필요해요.",
      });
    }
    if (
      (body.action === "queue-remove" || body.action === "queue-jump") &&
      typeof body.index !== "number"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${body.action} 제어에는 index가 필요해요.`,
      });
    }
    if (body.action === "seek" && typeof body.positionMs !== "number") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "seek 제어에는 positionMs가 필요해요.",
      });
    }
    if (body.action === "queue-move") {
      if (typeof body.from !== "number" || typeof body.to !== "number") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "queue-move 제어에는 from과 to가 필요해요.",
        });
      } else if (body.from === body.to) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "같은 위치로는 이동할 수 없어요.",
        });
      }
    }
  });

export const POST = createGuildApiHandler({
  role: "member",
  rate: WRITE_RATE,
  key: "player-command",
  schema: commandSchema,
  invalidMessage: "명령 형식이 올바르지 않아요.",
  handler: async ({ guildId, authz, data }) => {
    const result = await requestPlayerControl(guildId, authz.userId, data.action, {
      value: data.value,
      index: data.index,
      from: data.from,
      to: data.to,
      positionMs: data.positionMs,
    });
    if (!result.ok) {
      return NextResponse.json(
        {
          error:
            result.error ??
            "명령을 전달하지 못했어요. 잠시 후 다시 시도해 주세요.",
        },
        { status: result.status },
      );
    }

    return NextResponse.json({ ok: true });
  },
});
