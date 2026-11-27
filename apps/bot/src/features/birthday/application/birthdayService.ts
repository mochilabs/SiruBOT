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

export interface BirthdayMember {
	id: string;
	displayName: string;
	mention: string;
	avatarUrl: string | null;
}

export interface BirthdayDiscordPort {
	fetchMembers(guildId: string, userIds: readonly string[]): Promise<Map<string, BirthdayMember>>;
	celebrate(guildId: string, card: GreetingConfig, members: readonly BirthdayMember[]): Promise<void>;
	addRole(guildId: string, userId: string, roleId: string): Promise<boolean>;
	removeRole(guildId: string, userId: string, roleId: string): Promise<boolean>;
}

export interface BirthdayServiceDeps {
	db: Pick<PrismaClient, '$transaction' | 'scheduledJob' | 'birthdaySettings' | 'birthdayOptIn' | 'birthdayRoleGrant' | 'user' | 'guild'>;
	scheduler: Pick<GuildJobScheduler, 'register'>;
	discord: BirthdayDiscordPort;
	isFeatureEnabled: (guildId: string) => Promise<boolean>;
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

	public async isOptedIn(guildId: string, userId: string): Promise<boolean> {
		const row = await this.deps.db.birthdayOptIn.findUnique({ where: { guildId_userId: { guildId, userId } } });
		return row !== null;
	}

	public async setOptIn(guildId: string, userId: string, enabled: boolean): Promise<void> {
		if (!enabled) {
			await this.deps.db.birthdayOptIn.deleteMany({ where: { guildId, userId } });
			return;
		}
		await this.deps.db.guild.upsert({ where: { id: guildId }, create: { id: guildId }, update: {} });
		await this.deps.db.user.upsert({ where: { id: userId }, create: { id: userId }, update: {} });
		await this.deps.db.birthdayOptIn.upsert({
			where: { guildId_userId: { guildId, userId } },
			create: { guildId, userId },
			update: {}
		});
	}

	public async ensureScheduled(guildId: string, sendTime: string, options: { excludeJobId?: string; runAt?: Date } = {}): Promise<boolean> {
		const runAt = options.runAt ?? nextSendAt(this.now(), sendTime);
		return this.deps.db.$transaction(async (tx) => {
			// 같은 서버의 동시 호출을 advisory lock으로 직렬화해 중복 행을 막아요
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

	public async purgeGuild(guildId: string): Promise<void> {
		await this.deps.db.scheduledJob.deleteMany({ where: { guildId, kind: BIRTHDAY_DAILY_KIND, status: 'pending' } });
	}

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

	// 2/29생은 평년 2/28에 포함돼요
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
