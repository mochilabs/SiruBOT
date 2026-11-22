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

/** 입력 오류 — 라우트가 400으로 바꿔요 */
export class BirthdayRejected extends Error {}

/** 서버의 생일 축하 설정 — 행이 없거나 카드 JSON이 깨졌으면 기본값(꺼짐)이에요 */
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

/**
 * 설정 저장 — 새로 켜면 다음 날부터 축하하도록 `activeFrom`을 정하고(D-17), 켜져 있으면 다음 `birthday_daily` 작업을 보장해요.
 * 작업은 DB에 직접 써요 (스케줄러가 DB를 읽어서 봇에 알릴 필요가 없어요). 같은 서버의 동시 저장은 봇과 같은 advisory lock으로 한 줄로 세워요.
 * 보내는 시각을 바꾸면 대기 중인 작업의 시각도 새 시각으로 옮겨요.
 */
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
    // 외래 키 때문에 서버 행이 먼저 있어야 해요 (다른 설정 저장과 같은 방식)
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

/** 내가 생일 축하를 켠 서버 ID 목록 */
export async function listMyBirthdayGuildIds(userId: string): Promise<string[]> {
  const rows = await db.birthdayOptIn.findMany({ where: { userId }, select: { guildId: true } });
  return rows.map((row) => row.guildId);
}

/** 이 서버에서 내 생일 축하를 켜거나 꺼요 — 서버·사용자 행이 없으면 만들어요 */
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
