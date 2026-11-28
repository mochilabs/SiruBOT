import {
  checkGiveawayEnd,
  describeGiveawayCondition,
  GIVEAWAY_CONDITIONS_MAX,
  giveawayConditionSchema,
  giveawayPrizeSchema,
  type GiveawayStatus,
  giveawayWinnerCountSchema,
  parseGiveawayRequirements,
} from "@sirubot/utils/giveaway";
import { parseKstDateTime } from "@sirubot/utils/scheduledMessage";
import { z } from "zod";

import { db } from "@/lib/db";

export const startGiveawaySchema = z
  .object({
    channelId: z.string().regex(/^\d{17,20}$/, "올바른 ID 형식이 아니에요."),
    prize: giveawayPrizeSchema,
    winnerCount: giveawayWinnerCountSchema,
    endsAt: z.string().transform((text, ctx) => {
      const parsed = parseKstDateTime(text);
      if (!parsed) {
        ctx.addIssue({ code: "custom", message: '마감은 "2026-12-25 21:00"처럼 적어 주세요. (한국 시간)' });
        return z.NEVER;
      }
      return parsed;
    }),
    conditions: z.array(giveawayConditionSchema).max(GIVEAWAY_CONDITIONS_MAX),
  })
  .superRefine((value, ctx) => {
    const problem = checkGiveawayEnd(new Date(), value.endsAt);
    if (problem) ctx.addIssue({ code: "custom", path: ["endsAt"], message: problem });
  });

const PAST_LIMIT = 50;

export interface GiveawayItem {
  id: string;
  channelId: string;
  messageId: string | null;
  prize: string;
  winnerCount: number;
  status: GiveawayStatus;
  endsAt: string;
  entryCount: number;
  eligibleCount: number | null;
  winnerIds: string[];
  conditions: string[];
  createdBy: string;
}

export interface GiveawayList {
  running: GiveawayItem[];
  past: GiveawayItem[];
}

export async function listGiveaways(guildId: string): Promise<GiveawayList> {
  const [running, past] = await Promise.all([
    db.giveaway.findMany({
      where: { guildId, status: "running" },
      orderBy: { endsAt: "asc" },
      include: { _count: { select: { entries: true } } },
    }),
    db.giveaway.findMany({
      where: { guildId, status: { in: ["ended", "cancelled"] } },
      orderBy: { endedAt: "desc" },
      take: PAST_LIMIT,
      include: { _count: { select: { entries: true } } },
    }),
  ]);

  const toItem = (row: (typeof running)[number]): GiveawayItem => ({
    id: row.id,
    channelId: row.channelId,
    messageId: row.messageId,
    prize: row.prize,
    winnerCount: row.winnerCount,
    status: row.status,
    endsAt: row.endsAt.toISOString(),
    entryCount: row.entryCount ?? row._count.entries,
    eligibleCount: row.eligibleCount,
    winnerIds: row.winnerIds,
    conditions: (parseGiveawayRequirements(row.requirements)?.conditions ?? []).map(describeGiveawayCondition),
    createdBy: row.createdBy,
  });
  return { running: running.map(toItem), past: past.map(toItem) };
}
