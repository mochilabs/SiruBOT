import type { Prisma, PrismaClient, ScheduledJob } from '@sirubot/prisma';
import { isModuleDisabled } from '@sirubot/utils/modules';
import {
	buildRecurrence,
	checkNewScheduledMessage,
	describeRecurrence,
	formatKstDateTime,
	nextRunAt,
	parseScheduledMessagePayload,
	SCHEDULED_MESSAGE_KIND,
	SCHEDULED_MESSAGE_MISSED_SKIP_MS,
	SCHEDULED_MESSAGE_SETTINGS_DEFAULTS,
	scheduledMessageContentSchema,
	type ActiveScheduledMessage,
	type Recurrence,
	type ScheduledMessagePayload,
	type ScheduledMessageRepeat,
	type ScheduledMessageSettings
} from '@sirubot/utils/scheduledMessage';
import { AppError } from '../../../lib/appError.ts';
import type { AppLogger } from '../../../lib/appLogger.ts';
import type { GuildJobScheduler } from '../../../services/guildJobScheduler.ts';
import { JOB_MAX_ATTEMPTS } from '../../../services/guildJobScheduler.ts';

const MODULE_ID = 'community';

export type ChannelProblem = 'missing' | 'wrong-guild' | 'not-text' | 'no-view' | 'no-send';

export const CHANNEL_PROBLEM_MESSAGES: Record<ChannelProblem, string> = {
	missing: '채널을 찾을 수 없어요. 지워졌거나 봇이 볼 수 없는 채널이에요.',
	'wrong-guild': '이 서버의 채널이 아니에요.',
	'not-text': '메시지를 보낼 수 있는 텍스트·공지 채널이 아니에요.',
	'no-view': '봇이 이 채널을 볼 수 없어요. 채널 보기(View Channel) 권한이 필요해요.',
	'no-send': '봇이 이 채널에 메시지를 보낼 수 없어요. 메시지 보내기(Send Messages) 권한이 필요해요.'
};

export interface ScheduledMessageDiscordPort {
	checkChannel(guildId: string, channelId: string): Promise<ChannelProblem | null>;
	send(channelId: string, content: string): Promise<void>;
	notifyCreator(userId: string, guildId: string, text: string): Promise<boolean>;
}

export interface ScheduledMessageServiceDeps {
	db: Pick<PrismaClient, '$transaction' | 'scheduledJob' | 'scheduledMessageSettings' | 'guild'>;
	scheduler: Pick<GuildJobScheduler, 'register'>;
	discord: ScheduledMessageDiscordPort;
	logger: AppLogger;
	now?: () => Date;
}

export interface ScheduledMessageEntry {
	seriesId: string;
	channelId: string;
	content: string;
	runAt: Date;
	recurrence?: Recurrence;
	status: 'pending' | 'running' | 'failed';
	lastError: string | null;
	createdBy: string;
}

export interface CreateScheduledMessageInput {
	guildId: string;
	userId: string;
	channelId: string;
	content: string;
	runAt: Date;
	repeat: ScheduledMessageRepeat;
}

const ACTIVE_STATUSES = ['pending', 'running'] as const;
const seriesWhere = (seriesId: string): Prisma.JsonFilter<'ScheduledJob'> => ({ path: ['seriesId'], equals: seriesId });

export class ScheduledMessageService {
	public constructor(private readonly deps: ScheduledMessageServiceDeps) {
		deps.scheduler.register(SCHEDULED_MESSAGE_KIND, (job) => this.handle(job));
	}

	private now(): Date {
		return this.deps.now?.() ?? new Date();
	}

	public async getSettings(guildId: string): Promise<ScheduledMessageSettings> {
		const row = await this.deps.db.scheduledMessageSettings.findUnique({ where: { guildId } });
		return row ? { maxActive: row.maxActive, minIntervalMinutes: row.minIntervalMinutes } : SCHEDULED_MESSAGE_SETTINGS_DEFAULTS;
	}

	public async create(input: CreateScheduledMessageInput): Promise<ScheduledMessageEntry> {
		const content = scheduledMessageContentSchema.safeParse(input.content);
		if (!content.success)
			throw new AppError('invalid_input', content.error.issues[0]?.message ?? '메시지 내용이 올바르지 않아요.', { ephemeral: true });

		const problem = await this.deps.discord.checkChannel(input.guildId, input.channelId);
		if (problem) throw new AppError('invalid_input', CHANNEL_PROBLEM_MESSAGES[problem], { ephemeral: true });

		const recurrence = buildRecurrence(input.repeat, input.runAt);
		const seriesId = crypto.randomUUID();
		const payload: ScheduledMessagePayload = {
			seriesId,
			channelId: input.channelId,
			content: content.data,
			...(recurrence ? { recurrence } : {})
		};

		await this.deps.db.$transaction(async (tx) => {
			await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${SCHEDULED_MESSAGE_KIND}:${input.guildId}`}))`;
			const settingsRow = await tx.scheduledMessageSettings.findUnique({ where: { guildId: input.guildId } });
			const settings = settingsRow
				? { maxActive: settingsRow.maxActive, minIntervalMinutes: settingsRow.minIntervalMinutes }
				: SCHEDULED_MESSAGE_SETTINGS_DEFAULTS;
			const rows = await tx.scheduledJob.findMany({
				where: { guildId: input.guildId, kind: SCHEDULED_MESSAGE_KIND, status: { in: [...ACTIVE_STATUSES] } }
			});
			const check = checkNewScheduledMessage({
				now: this.now(),
				runAt: input.runAt,
				channelId: input.channelId,
				recurrence,
				existing: toActive(rows),
				settings
			});
			if (!check.ok) throw new AppError('conflict', check.message, { ephemeral: true, code: check.code });
			await tx.scheduledJob.create({
				data: {
					guildId: input.guildId,
					kind: SCHEDULED_MESSAGE_KIND,
					runAt: input.runAt,
					payload: payload as unknown as Prisma.InputJsonObject,
					createdBy: input.userId
				}
			});
		});

		return {
			seriesId,
			channelId: input.channelId,
			content: content.data,
			runAt: input.runAt,
			recurrence,
			status: 'pending',
			lastError: null,
			createdBy: input.userId
		};
	}

	public async list(guildId: string): Promise<ScheduledMessageEntry[]> {
		const rows = await this.deps.db.scheduledJob.findMany({
			where: { guildId, kind: SCHEDULED_MESSAGE_KIND, status: { in: ['pending', 'running', 'failed'] } },
			orderBy: { runAt: 'asc' }
		});
		const rank = { pending: 0, running: 1, failed: 2 } as const;
		const bySeries = new Map<string, ScheduledMessageEntry>();
		for (const row of rows) {
			const payload = parseScheduledMessagePayload(row.payload);
			if (!payload || row.status === 'done') continue;
			const entry: ScheduledMessageEntry = {
				seriesId: payload.seriesId,
				channelId: payload.channelId,
				content: payload.content,
				runAt: row.runAt,
				recurrence: payload.recurrence,
				status: row.status,
				lastError: row.lastError,
				createdBy: row.createdBy
			};
			const current = bySeries.get(payload.seriesId);
			if (!current || rank[entry.status] < rank[current.status]) bySeries.set(payload.seriesId, entry);
		}
		return [...bySeries.values()].sort((a, b) => a.runAt.getTime() - b.runAt.getTime());
	}

	public async remove(guildId: string, seriesId: string): Promise<boolean> {
		const { count } = await this.deps.db.scheduledJob.deleteMany({
			where: { guildId, kind: SCHEDULED_MESSAGE_KIND, status: { in: ['pending', 'failed', 'done'] }, payload: seriesWhere(seriesId) }
		});
		return count > 0;
	}

	public async purgeGuild(guildId: string): Promise<number> {
		const { count } = await this.deps.db.scheduledJob.deleteMany({
			where: { guildId, kind: SCHEDULED_MESSAGE_KIND, status: { in: ['pending', 'failed', 'done'] } }
		});
		return count;
	}

	public async handle(job: ScheduledJob): Promise<void> {
		const payload = parseScheduledMessagePayload(job.payload);
		if (!payload) throw new Error('예약 내용이 올바르지 않아요.');
		const now = this.now();

		// 반복이면 보내기 전에 다음 회차를 먼저 넣어요 — 전송이 실패해도 반복은 이어지고, 재시도·재실행에도 중복으로 넣지 않아요
		if (payload.recurrence) await this.ensureNext(job, payload, payload.recurrence, now);

		if (payload.recurrence && now.getTime() - job.runAt.getTime() > SCHEDULED_MESSAGE_MISSED_SKIP_MS) {
			this.deps.logger.info(`[scheduled-message] 오래 밀린 반복 회차는 건너뛰어요 (job ${job.id}, guild ${job.guildId})`);
			return;
		}

		const guild = await this.deps.db.guild.findUnique({ where: { id: job.guildId }, select: { disabledModules: true } });
		if (isModuleDisabled(guild?.disabledModules, MODULE_ID)) {
			this.deps.logger.info(`[scheduled-message] 커뮤니티 모듈이 꺼져 있어 보내지 않아요 (job ${job.id}, guild ${job.guildId})`);
			return;
		}

		try {
			const problem = await this.deps.discord.checkChannel(job.guildId, payload.channelId);
			if (problem) throw new Error(CHANNEL_PROBLEM_MESSAGES[problem]);
			await this.deps.discord.send(payload.channelId, payload.content);
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			if (job.attempts + 1 >= JOB_MAX_ATTEMPTS) await this.notifyFailure(job, payload, reason);
			throw error;
		}
	}

	private async ensureNext(job: ScheduledJob, payload: ScheduledMessagePayload, recurrence: Recurrence, now: Date): Promise<void> {
		const { db } = this.deps;
		const exists = await db.scheduledJob.findFirst({
			where: { guildId: job.guildId, kind: SCHEDULED_MESSAGE_KIND, status: 'pending', payload: seriesWhere(payload.seriesId) },
			select: { id: true }
		});
		if (!exists) {
			// 밀려서 실행돼도 지난 회차를 몰아서 보내지 않도록 "지금 이후"로 계산해요
			const after = job.runAt.getTime() > now.getTime() ? job.runAt : now;
			await db.scheduledJob.create({
				data: {
					guildId: job.guildId,
					kind: SCHEDULED_MESSAGE_KIND,
					runAt: nextRunAt(recurrence, after),
					payload: payload as unknown as Prisma.InputJsonObject,
					createdBy: job.createdBy
				}
			});
		}
		await db.scheduledJob.deleteMany({
			where: {
				guildId: job.guildId,
				kind: SCHEDULED_MESSAGE_KIND,
				status: { in: ['done', 'failed'] },
				runAt: { lt: job.runAt },
				payload: seriesWhere(payload.seriesId)
			}
		});
	}

	private async notifyFailure(job: ScheduledJob, payload: ScheduledMessagePayload, reason: string): Promise<void> {
		const snippet = payload.content.length > 80 ? `${payload.content.slice(0, 79)}…` : payload.content;
		const text = [
			'예약 메시지를 보내지 못했어요.',
			`- 채널: <#${payload.channelId}>`,
			`- 예정 시각: ${formatKstDateTime(job.runAt)} (${describeRecurrence(payload.recurrence)})`,
			`- 이유: ${reason}`,
			`- 내용: ${snippet}`,
			'채널 권한을 고친 뒤 /공지 만들기로 다시 예약해 주세요.' + (payload.recurrence ? ' 반복 예약은 다음 회차에 다시 시도해요.' : '')
		].join('\n');
		const delivered = await this.deps.discord.notifyCreator(job.createdBy, job.guildId, text).catch(() => false);
		if (!delivered) this.deps.logger.warn(`[scheduled-message] 만든 사람에게 실패를 알리지 못했어요 (job ${job.id}, user ${job.createdBy})`);
	}
}

function toActive(rows: ScheduledJob[]): ActiveScheduledMessage[] {
	const list: ActiveScheduledMessage[] = [];
	for (const row of rows) {
		const payload = parseScheduledMessagePayload(row.payload);
		if (payload) list.push({ seriesId: payload.seriesId, channelId: payload.channelId, runAt: row.runAt, recurrence: payload.recurrence });
	}
	return list;
}

export function createScheduledMessageService(deps: ScheduledMessageServiceDeps): ScheduledMessageService {
	return new ScheduledMessageService(deps);
}
