import type { Prisma, ScheduledJob } from "@sirubot/prisma";
import {
  type ActiveScheduledMessage,
  buildRecurrence,
  checkNewScheduledMessage,
  type CreateScheduledMessageInput,
  describeRecurrence,
  formatKstDateTime,
  parseKstDateTime,
  parseScheduledMessagePayload,
  SCHEDULED_MESSAGE_KIND,
  SCHEDULED_MESSAGE_SETTINGS_DEFAULTS,
  type ScheduledMessagePayload,
  type ScheduledMessageSettings,
} from "@sirubot/utils/scheduledMessage";

import { db } from "@/lib/db";

export interface ScheduledMessageItem {
  seriesId: string;
  channelId: string;
  content: string;
  runAt: string;
  repeat: string;
  status: "pending" | "running" | "failed";
  lastError: string | null;
  createdBy: string;
}

export class ScheduledMessageRejected extends Error {
  public constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
  }
}

function toActive(rows: ScheduledJob[]): ActiveScheduledMessage[] {
  const list: ActiveScheduledMessage[] = [];
  for (const row of rows) {
    const payload = parseScheduledMessagePayload(row.payload);
    if (payload) {
      list.push({
        seriesId: payload.seriesId,
        channelId: payload.channelId,
        runAt: row.runAt,
        recurrence: payload.recurrence,
      });
    }
  }
  return list;
}

export async function getScheduledMessageSettings(
  guildId: string,
): Promise<ScheduledMessageSettings> {
  const row = await db.scheduledMessageSettings.findUnique({ where: { guildId } });
  return row
    ? { maxActive: row.maxActive, minIntervalMinutes: row.minIntervalMinutes }
    : SCHEDULED_MESSAGE_SETTINGS_DEFAULTS;
}

export async function createScheduledMessage(
  guildId: string,
  userId: string,
  input: CreateScheduledMessageInput,
): Promise<ScheduledMessageItem> {
  const runAt = parseKstDateTime(input.runAt);
  if (!runAt) throw new ScheduledMessageRejected("일시가 올바르지 않아요.", "invalid");
  const recurrence = buildRecurrence(input.repeat, runAt);
  const payload: ScheduledMessagePayload = {
    seriesId: crypto.randomUUID(),
    channelId: input.channelId,
    content: input.content,
    ...(recurrence ? { recurrence } : {}),
  };

  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${SCHEDULED_MESSAGE_KIND}:${guildId}`}))`;
    const settingsRow = await tx.scheduledMessageSettings.findUnique({ where: { guildId } });
    const settings = settingsRow
      ? { maxActive: settingsRow.maxActive, minIntervalMinutes: settingsRow.minIntervalMinutes }
      : SCHEDULED_MESSAGE_SETTINGS_DEFAULTS;
    const rows = await tx.scheduledJob.findMany({
      where: { guildId, kind: SCHEDULED_MESSAGE_KIND, status: { in: ["pending", "running"] } },
    });
    const check = checkNewScheduledMessage({
      now: new Date(),
      runAt,
      channelId: input.channelId,
      recurrence,
      existing: toActive(rows),
      settings,
    });
    if (!check.ok) throw new ScheduledMessageRejected(check.message, check.code);
    await tx.scheduledJob.create({
      data: {
        guildId,
        kind: SCHEDULED_MESSAGE_KIND,
        runAt,
        payload: payload as unknown as Prisma.InputJsonObject,
        createdBy: userId,
      },
    });
  });

  return {
    seriesId: payload.seriesId,
    channelId: payload.channelId,
    content: payload.content,
    runAt: formatKstDateTime(runAt),
    repeat: describeRecurrence(recurrence),
    status: "pending",
    lastError: null,
    createdBy: userId,
  };
}

export async function listScheduledMessages(guildId: string): Promise<ScheduledMessageItem[]> {
  const rows = await db.scheduledJob.findMany({
    where: { guildId, kind: SCHEDULED_MESSAGE_KIND, status: { in: ["pending", "running", "failed"] } },
    orderBy: { runAt: "asc" },
  });
  const rank = { pending: 0, running: 1, failed: 2 } as const;
  const bySeries = new Map<string, { item: ScheduledMessageItem; runAt: Date }>();
  for (const row of rows) {
    const payload = parseScheduledMessagePayload(row.payload);
    if (!payload || row.status === "done") continue;
    const item: ScheduledMessageItem = {
      seriesId: payload.seriesId,
      channelId: payload.channelId,
      content: payload.content,
      runAt: formatKstDateTime(row.runAt),
      repeat: describeRecurrence(payload.recurrence),
      status: row.status,
      lastError: row.lastError,
      createdBy: row.createdBy,
    };
    const current = bySeries.get(payload.seriesId);
    if (!current || rank[item.status] < rank[current.item.status]) {
      bySeries.set(payload.seriesId, { item, runAt: row.runAt });
    }
  }
  return [...bySeries.values()]
    .sort((a, b) => a.runAt.getTime() - b.runAt.getTime())
    .map((entry) => entry.item);
}

export async function deleteScheduledMessage(guildId: string, seriesId: string): Promise<boolean> {
  const { count } = await db.scheduledJob.deleteMany({
    where: {
      guildId,
      kind: SCHEDULED_MESSAGE_KIND,
      status: { in: ["pending", "failed", "done"] },
      payload: { path: ["seriesId"], equals: seriesId },
    },
  });
  return count > 0;
}
