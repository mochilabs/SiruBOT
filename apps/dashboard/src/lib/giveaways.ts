import {
  describeGiveawayCondition,
  type GiveawayStatus,
  parseGiveawayRequirements,
} from "@sirubot/utils/giveaway";

import { db } from "@/lib/db";

/** 목록에 보여줄 지난 기브어웨이 수 */
const PAST_LIMIT = 50;

/** 대시보드에 내려주는 기브어웨이 한 건 — 시각은 ISO 문자열이에요 */
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

/** 진행 중 전부와 최근 지난 기브어웨이를 내려줘요 (읽기 전용 — 시작·종료는 Discord에서 해요) */
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
