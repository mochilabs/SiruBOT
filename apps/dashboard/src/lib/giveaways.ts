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

/**
 * 나눔 시작 입력 — 마감은 화면이 보내는 한국 시간 "YYYY-MM-DD HH:mm"이고, 검증 후 Date로 바뀌어요.
 * 상품·당첨자 수·조건·마감 범위는 봇 명령과 같은 규칙(@sirubot/utils/giveaway)이에요.
 */
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

/** 목록에 보여줄 지난 나눔 수 */
const PAST_LIMIT = 50;

/** 대시보드에 내려주는 나눔 한 건 — 시각은 ISO 문자열이에요 */
export interface GiveawayItem {
  id: string;
  channelId: string;
  messageId: string | null;
  prize: string;
  winnerCount: number;
  status: GiveawayStatus;
  endsAt: string;
  /** 마감 전에는 지금까지 참여한 수, 마감 후에는 마감 시점 참여자 수 */
  entryCount: number;
  eligibleCount: number | null;
  winnerIds: string[];
  /** 참여 조건을 사람이 읽는 문장으로 (역할은 `<@&id>` 형태라 화면에서 이름으로 바꿔요) */
  conditions: string[];
  createdBy: string;
}

export interface GiveawayList {
  running: GiveawayItem[];
  past: GiveawayItem[];
}

/** 진행 중 전부와 최근 지난 나눔을 내려줘요 */
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
