import type { PrismaClient, ScheduledJob } from '@sirubot/prisma';
import {
	BIRTHDAY_DAILY_KIND,
	birthdayDatesFor,
	kstDateOf,
	kstDateString,
	nextDailyRun,
	nextSendAt,
	shouldCelebrate
} from '@sirubot/utils/birthdayCelebration';
import { validateGreetingConfig, type GreetingConfig } from '@sirubot/utils/memberGreeting';
import type { AppLogger } from '../../../lib/appLogger.ts';
import type { GuildJobScheduler } from '../../../services/guildJobScheduler.ts';

/** 축하 카드에 담을 멤버 — Discord 객체 대신 이 사본만 포트로 오가요 */
export interface BirthdayMember {
	id: string;
	displayName: string;
	/** `<@id>` */
	mention: string;
	avatarUrl: string | null;
}

/** 생일 축하가 Discord와 주고받는 포트 — 실제 구현은 features/birthday/discord/birthdayDiscord.ts예요 */
export interface BirthdayDiscordPort {
	/** 서버에 남아 있는 사람 멤버. 서버를 나갔거나 봇인 사람은 결과에 없어요 */
	fetchMembers(guildId: string, userIds: readonly string[]): Promise<Map<string, BirthdayMember>>;
	/** 축하 메시지(카드) 1개를 보내요. 채널이 없거나 권한이 없으면 던져요 */
	celebrate(guildId: string, card: GreetingConfig, members: readonly BirthdayMember[]): Promise<void>;
	/** 역할을 줘요. 못 주면 false (권한·역할 위치 문제) */
	addRole(guildId: string, userId: string, roleId: string): Promise<boolean>;
	/** 역할을 거둬요. 멤버나 역할이 이미 없으면 성공으로 보고, 일시 오류만 false예요 */
	removeRole(guildId: string, userId: string, roleId: string): Promise<boolean>;
}

export interface BirthdayServiceDeps {
	db: Pick<PrismaClient, '$transaction' | 'scheduledJob' | 'birthdaySettings' | 'birthdayOptIn' | 'birthdayRoleGrant' | 'user' | 'guild'>;
	/** 핸들러 등록에만 써요 */
	scheduler: Pick<GuildJobScheduler, 'register'>;
	discord: BirthdayDiscordPort;
	/** 커뮤니티 모듈(P-06)이 이 서버에서 켜져 있는지 */
	isFeatureEnabled: (guildId: string) => Promise<boolean>;
	/** 축하를 보냈을 때 사용 지표로 남겨요 */
	recordUsage?: (guildId: string) => void;
	logger: AppLogger;
	now?: () => Date;
}

const ACTIVE_STATUSES = ['pending', 'running'] as const;

export class BirthdayService {
	public constructor(private readonly deps: BirthdayServiceDeps) {
		deps.scheduler.register(BIRTHDAY_DAILY_KIND, (job) => this.handle(job));
	}

	private now(): Date {
		return this.deps.now?.() ?? new Date();
	}

	/* ------------------------------------------------------------ 동의 */

	public async isOptedIn(guildId: string, userId: string): Promise<boolean> {
		const row = await this.deps.db.birthdayOptIn.findUnique({ where: { guildId_userId: { guildId, userId } } });
		return row !== null;
	}

	/** 이 서버에서 내 생일 축하를 켜거나 꺼요 — 서버 단위 본인 동의예요 (D-17) */
	public async setOptIn(guildId: string, userId: string, enabled: boolean): Promise<void> {
		if (!enabled) {
			await this.deps.db.birthdayOptIn.deleteMany({ where: { guildId, userId } });
			return;
		}
		// 외래 키가 있어서 서버와 사용자 행이 없으면 먼저 만들어요
		await this.deps.db.guild.upsert({ where: { id: guildId }, create: { id: guildId }, update: {} });
		await this.deps.db.user.upsert({ where: { id: userId }, create: { id: userId }, update: {} });
		await this.deps.db.birthdayOptIn.upsert({
			where: { guildId_userId: { guildId, userId } },
			create: { guildId, userId },
			update: {}
		});
	}

	/* ------------------------------------------------------------ 작업 예약 */

	/**
	 * 이 서버의 다음 `birthday_daily` 작업이 없으면 다음 보내는 시각에 만들어요 (있으면 그대로).
	 * 같은 서버의 동시 호출은 advisory lock으로 한 줄로 세워서 중복 행을 막아요.
	 */
	public async ensureScheduled(guildId: string, sendTime: string, options: { excludeJobId?: string; runAt?: Date } = {}): Promise<boolean> {
		const runAt = options.runAt ?? nextSendAt(this.now(), sendTime);
		return this.deps.db.$transaction(async (tx) => {
			await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${BIRTHDAY_DAILY_KIND}:${guildId}`}))`;
			const existing = await tx.scheduledJob.count({
				where: {
					guildId,
					kind: BIRTHDAY_DAILY_KIND,
					status: { in: [...ACTIVE_STATUSES] },
					...(options.excludeJobId ? { id: { not: options.excludeJobId } } : {})
				}
			});
			if (existing > 0) return false;
			await tx.scheduledJob.create({ data: { guildId, kind: BIRTHDAY_DAILY_KIND, runAt, payload: {}, createdBy: 'system' } });
			return true;
		});
	}

	/** 부팅 때 — 켜져 있는데 작업이 끊긴 서버(대시보드 저장 실패, 3회 실패 등)의 작업을 다시 만들어요 */
	public async reconcile(guildIds: readonly string[]): Promise<number> {
		if (guildIds.length === 0) return 0;
		const rows = await this.deps.db.birthdaySettings.findMany({
			where: { guildId: { in: [...guildIds] } },
			select: { guildId: true, config: true, sendTime: true }
		});
		let created = 0;
		for (const row of rows) {
			if (!validateGreetingConfig(row.config)?.enabled) continue;
			if (await this.ensureScheduled(row.guildId, row.sendTime)) created++;
		}
		return created;
	}

	/** 서버를 나가면 대기 중인 작업을 지워요 (설정·동의는 서버 행과 함께 남겨요) */
	public async purgeGuild(guildId: string): Promise<void> {
		await this.deps.db.scheduledJob.deleteMany({ where: { guildId, kind: BIRTHDAY_DAILY_KIND, status: 'pending' } });
	}

	/* ------------------------------------------------------------ 하루 한 번 */

	/**
	 * `birthday_daily` 핸들러 — 서버마다 하루에 한 번 돌아요.
	 * 순서: 지난 역할 회수 → (꺼졌으면 여기서 끝, 다음 작업은 만들지 않아요) → 다음 회차 먼저 예약 →
	 * 오늘 생일 + 동의 + 서버에 남은 멤버 → 역할 부여 → 카드 1장으로 모아서 전송 → 보낸 날 기록.
	 * 전송이 실패하면 던져서 재시도해요 (역할 부여는 여러 번 해도 같아요). 보낸 뒤에는 던지지 않아 중복 전송이 없어요.
	 */
	private async handle(job: ScheduledJob): Promise<void> {
		const { guildId } = job;
		const now = this.now();
		const today = kstDateString(now);

		await this.revokeExpiredRoles(guildId, today);

		const settings = await this.deps.db.birthdaySettings.findUnique({ where: { guildId } });
		const card = settings ? validateGreetingConfig(settings.config) : null;
		if (!settings || !card?.enabled) return;

		// 다음 회차를 먼저 예약해요 — 아래에서 실패해도 매일 도는 고리가 끊기지 않아요
		await this.ensureScheduled(guildId, settings.sendTime, {
			excludeJobId: job.id,
			runAt: nextDailyRun(job.runAt, now, settings.sendTime)
		});

		// 봇이 오래 꺼져 있다가 다른 날에 돌았으면 그날 생일은 건너뛰어요
		if (kstDateString(job.runAt) !== today) return;
		if (!shouldCelebrate({ today, activeFrom: settings.activeFrom, lastCelebratedOn: settings.lastCelebratedOn })) return;
		if (!(await this.deps.isFeatureEnabled(guildId).catch(() => true))) return;

		const members = await this.todaysBirthdayMembers(guildId, now);
		if (members.length === 0) return;

		if (settings.roleId) await this.grantRoles(guildId, settings.roleId, members, today);

		if (card.channelId) {
			await this.deps.discord.celebrate(guildId, card, members);
			this.deps.recordUsage?.(guildId);
		}
		await this.deps.db.birthdaySettings.update({ where: { guildId }, data: { lastCelebratedOn: today } });
	}

	/** 오늘 생일이고 이 서버에서 동의했고 아직 서버에 있는 멤버 (2/29생은 평년 2/28에 포함돼요) */
	private async todaysBirthdayMembers(guildId: string, now: Date): Promise<BirthdayMember[]> {
		const dates = birthdayDatesFor(kstDateOf(now));
		const rows = await this.deps.db.birthdayOptIn.findMany({
			where: { guildId, user: { OR: dates.map((date) => ({ birthMonth: date.month, birthDay: date.day })) } },
			select: { userId: true },
			orderBy: { createdAt: 'asc' }
		});
		if (rows.length === 0) return [];
		const found = await this.deps.discord.fetchMembers(
			guildId,
			rows.map((row) => row.userId)
		);
		return rows.flatMap((row) => {
			const member = found.get(row.userId);
			return member ? [member] : [];
		});
	}

	private async grantRoles(guildId: string, roleId: string, members: readonly BirthdayMember[], today: string): Promise<void> {
		for (const member of members) {
			const ok = await this.deps.discord.addRole(guildId, member.id, roleId).catch(() => false);
			if (!ok) {
				this.deps.logger.warn(`[birthday] 생일 역할을 주지 못했어요 (guild ${guildId}, user ${member.id}, role ${roleId})`);
				continue;
			}
			await this.deps.db.birthdayRoleGrant.upsert({
				where: { guildId_userId: { guildId, userId: member.id } },
				create: { guildId, userId: member.id, roleId, grantedOn: today },
				update: { roleId, grantedOn: today }
			});
		}
	}

	/** 오늘보다 앞선 날 준 역할을 거둬요. 일시 오류로 못 거둔 행은 남겨서 다음 회차가 다시 시도해요 */
	private async revokeExpiredRoles(guildId: string, today: string): Promise<void> {
		const grants = await this.deps.db.birthdayRoleGrant.findMany({ where: { guildId, grantedOn: { lt: today } } });
		for (const grant of grants) {
			const ok = await this.deps.discord.removeRole(guildId, grant.userId, grant.roleId).catch(() => false);
			if (!ok) {
				this.deps.logger.warn(`[birthday] 생일 역할을 거두지 못했어요, 다음에 다시 해요 (guild ${guildId}, user ${grant.userId})`);
				continue;
			}
			await this.deps.db.birthdayRoleGrant.deleteMany({ where: { guildId, userId: grant.userId, grantedOn: grant.grantedOn } });
		}
	}
}

export function createBirthdayService(deps: BirthdayServiceDeps): BirthdayService {
	return new BirthdayService(deps);
}
