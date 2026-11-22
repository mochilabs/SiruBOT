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

/** 예약 메시지가 속한 모듈 — 이 모듈이 꺼진 서버에서는 보내지 않아요 (P-06) */
const MODULE_ID = 'community';

/** 보낼 채널을 못 쓰는 이유 */
export type ChannelProblem = 'missing' | 'wrong-guild' | 'not-text' | 'no-view' | 'no-send';

export const CHANNEL_PROBLEM_MESSAGES: Record<ChannelProblem, string> = {
	missing: '채널을 찾을 수 없어요. 지워졌거나 봇이 볼 수 없는 채널이에요.',
	'wrong-guild': '이 서버의 채널이 아니에요.',
	'not-text': '메시지를 보낼 수 있는 텍스트·공지 채널이 아니에요.',
	'no-view': '봇이 이 채널을 볼 수 없어요. 채널 보기(View Channel) 권한이 필요해요.',
	'no-send': '봇이 이 채널에 메시지를 보낼 수 없어요. 메시지 보내기(Send Messages) 권한이 필요해요.'
};

/** 예약 메시지가 Discord와 주고받는 포트 — 실제 구현은 features/scheduled-messages/discord/scheduledMessageDiscord.ts예요 */
export interface ScheduledMessageDiscordPort {
	/** 그 길드의 채널에 봇이 ViewChannel·SendMessages 권한으로 보낼 수 있는지. 문제가 없으면 null */
	checkChannel(guildId: string, channelId: string): Promise<ChannelProblem | null>;
	/** 메시지를 보내요. @everyone/@here는 allowedMentions로 막아요. 못 보내면 던져요 */
	send(channelId: string, content: string): Promise<void>;
	/** 만든 사람에게 DM으로 알려요 (DM이 막혀 있으면 false) */
	notifyCreator(userId: string, guildId: string, text: string): Promise<boolean>;
}

export interface ScheduledMessageServiceDeps {
	db: Pick<PrismaClient, '$transaction' | 'scheduledJob' | 'scheduledMessageSettings' | 'guild'>;
	/** 핸들러 등록에만 써요 */
	scheduler: Pick<GuildJobScheduler, 'register'>;
	discord: ScheduledMessageDiscordPort;
	logger: AppLogger;
	now?: () => Date;
}

export interface ScheduledMessageEntry {
	seriesId: string;
	channelId: string;
	content: string;
	/** 다음(또는 마지막) 실행 시각 */
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

	/** 새 예약 — 본문·채널·상한·간격을 확인하고, 같은 서버의 동시 생성은 advisory lock으로 한 줄로 세워요 */
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

	/** 이 서버의 예약 목록 — 같은 예약의 회차는 한 줄로 묶고, 대기 > 실행 중 > 실패 순으로 대표 행을 골라요 */
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

	/** 예약 삭제 — 같은 예약의 대기·실패·끝난 회차를 모두 지워요. 이미 실행 중인 회차는 막을 수 없어요 */
	public async remove(guildId: string, seriesId: string): Promise<boolean> {
		const { count } = await this.deps.db.scheduledJob.deleteMany({
			where: { guildId, kind: SCHEDULED_MESSAGE_KIND, status: { in: ['pending', 'failed', 'done'] }, payload: seriesWhere(seriesId) }
		});
		return count > 0;
	}

	/** 봇이 서버에서 나갔을 때 — 대기 중인 예약을 지워요. 다시 들어왔을 때 오래된 공지가 갑자기 나가지 않게요 */
	public async purgeGuild(guildId: string): Promise<number> {
		const { count } = await this.deps.db.scheduledJob.deleteMany({
			where: { guildId, kind: SCHEDULED_MESSAGE_KIND, status: { in: ['pending', 'failed', 'done'] } }
		});
		return count;
	}

	/** 스케줄러가 부르는 핸들러 — 던지면 스케줄러가 재시도하고, 3번째 실패에서 failed로 닫아요 */
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
		// 이전 회차 기록은 가장 최근 것만 남겨요 (매일 반복해도 행이 쌓이지 않게)
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
