import {
  BIRTHDAY_DAILY_KIND,
  BIRTHDAY_SETTINGS_DEFAULTS,
  type BirthdaySettings,
  type BirthdaySettingsInput,
  nextActiveFrom,
  nextSendAt,
} from "@sirubot/utils/birthdayCelebration";
import { validateGreetingConfig } from "@sirubot/utils/memberGreeting";

import { db } from "@/lib/db";

export class BirthdayRejected extends Error {}

export async function getBirthdaySettings(guildId: string): Promise<BirthdaySettings> {
  const row = await db.birthdaySettings.findUnique({ where: { guildId } });
  if (!row) return BIRTHDAY_SETTINGS_DEFAULTS;
  return {
    card: validateGreetingConfig(row.config) ?? BIRTHDAY_SETTINGS_DEFAULTS.card,
    sendTime: row.sendTime,
    roleId: row.roleId,
    activeFrom: row.activeFrom,
  };
}

export async function saveBirthdaySettings(
  guildId: string,
  input: BirthdaySettingsInput,
): Promise<BirthdaySettings> {
  if (input.card.enabled && !input.card.channelId) {
    throw new BirthdayRejected("축하 메시지를 보낼 채널을 선택해 주세요.");
  }
  const now = new Date();

  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${BIRTHDAY_DAILY_KIND}:${guildId}`}))`;
    await tx.guild.upsert({ where: { id: guildId }, create: { id: guildId }, update: {} });
    const previous = await tx.birthdaySettings.findUnique({ where: { guildId } });
    const previousEnabled = previous ? (validateGreetingConfig(previous.config)?.enabled ?? false) : false;
    const activeFrom = nextActiveFrom(
      { enabled: previousEnabled, activeFrom: previous?.activeFrom ?? null },
      input.card.enabled,
      now,
    );
    const data = {
      config: input.card as unknown as object,
      sendTime: input.sendTime,
      roleId: input.roleId,
      activeFrom,
    };
    await tx.birthdaySettings.upsert({ where: { guildId }, create: { guildId, ...data }, update: data });

    if (!input.card.enabled) return;
    const runAt = nextSendAt(now, input.sendTime);
    const pending = await tx.scheduledJob.findMany({
      where: { guildId, kind: BIRTHDAY_DAILY_KIND, status: { in: ["pending", "running"] } },
      select: { id: true, status: true },
    });
    if (pending.length === 0) {
      await tx.scheduledJob.create({
        data: { guildId, kind: BIRTHDAY_DAILY_KIND, runAt, payload: {}, createdBy: "dashboard" },
      });
    } else if (previous && previous.sendTime !== input.sendTime) {
      await tx.scheduledJob.updateMany({
        where: { id: { in: pending.filter((job) => job.status === "pending").map((job) => job.id) } },
        data: { runAt },
      });
    }
  });

  return getBirthdaySettings(guildId);
}

export async function listMyBirthdayGuildIds(userId: string): Promise<string[]> {
  const rows = await db.birthdayOptIn.findMany({ where: { userId }, select: { guildId: true } });
  return rows.map((row) => row.guildId);
}

export async function setMyBirthdayOptIn(guildId: string, userId: string, enabled: boolean): Promise<void> {
  if (!enabled) {
    await db.birthdayOptIn.deleteMany({ where: { guildId, userId } });
    return;
  }
  await db.user.upsert({ where: { id: userId }, create: { id: userId }, update: {} });
  await db.birthdayOptIn.upsert({
    where: { guildId_userId: { guildId, userId } },
    create: { guildId, userId },
    update: {},
  });
}
