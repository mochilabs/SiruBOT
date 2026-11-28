import { randomInt } from 'node:crypto';
import type { Prisma, PrismaClient, ScheduledJob } from '@sirubot/prisma';
import {
	checkGiveawayEnd,
	drawWinners,
	evaluateGiveawayConditions,
	GIVEAWAY_CARD_UPDATE_INTERVAL_MS,
	GIVEAWAY_KIND,
	GIVEAWAY_MAX_RUNNING,
	giveawayPrizeSchema,
	giveawayWinnerCountSchema,
	parseGiveawayJobPayload,
	parseGiveawayRequirements,
	type GiveawayCondition,
	type GiveawayMemberFacts,
	type GiveawayStatus
} from '@sirubot/utils/giveaway';
import { AppError } from '../../../lib/appError.ts';
import type { AppLogger } from '../../../lib/appLogger.ts';
import { KeyedTimers } from '../../../lib/keyedTimers.ts';
import type { Stoppable } from '../../../lib/lifecycle.ts';
import type { GuildJobScheduler } from '../../../services/guildJobScheduler.ts';

export interface GiveawayCardData {
	id: string;
	guildId: string;
	prize: string;
	winnerCount: number;
	endsAt: Date;
	conditions: readonly GiveawayCondition[];
	status: GiveawayStatus;
	entryCount: number;
	winnerIds: readonly string[];
	createdBy: string;
}

export type GiveawayCardResult = 'ok' | 'gone' | 'failed';

export interface GiveawayDiscordPort {
	checkChannel(guildId: string, channelId: string): Promise<string | null>;
	publish(channelId: string, card: GiveawayCardData): Promise<string>;
	updateCard(channelId: string, messageId: string, card: GiveawayCardData): Promise<GiveawayCardResult>;
	announce(
		channelId: string,
		messageId: string | null,
		card: GiveawayCardData,
		kind: 'end' | 'reroll',
		newWinnerIds: readonly string[]
	): Promise<'ok' | 'gone'>;
	fetchMembers(guildId: string, userIds: readonly string[]): Promise<Map<string, GiveawayMemberFacts>>;
}

export interface GiveawayServiceDeps {
	db: Pick<PrismaClient, '$transaction' | 'giveaway' | 'giveawayEntry' | 'scheduledJob'>;
	scheduler: Pick<GuildJobScheduler, 'register'>;
	discord: GiveawayDiscordPort;
	logger: AppLogger;
	now?: () => Date;
	randomInt?: (maxExclusive: number) => number;
	cardUpdateIntervalMs?: number;
}

export interface StartGiveawayInput {
	guildId: string;
	channelId: string;
	userId: string;
	prize: string;
	winnerCount: number;
	endsAt: Date;
	conditions: GiveawayCondition[];
}

export type EnterResult = { kind: 'entered' } | { kind: 'already' } | { kind: 'closed' } | { kind: 'ineligible'; reasons: string[] };

export interface GiveawaySummary {
	id: string;
	prize: string;
	status: GiveawayStatus;
	endsAt: Date;
}

const toCard = (
	row: {
		id: string;
		guildId: string;
		prize: string;
		winnerCount: number;
		endsAt: Date;
		status: GiveawayStatus;
		winnerIds: string[];
		createdBy: string;
	},
	conditions: readonly GiveawayCondition[],
	entryCount: number
): GiveawayCardData => ({
	id: row.id,
	guildId: row.guildId,
	prize: row.prize,
	winnerCount: row.winnerCount,
	endsAt: row.endsAt,
	conditions,
	status: row.status,
	entryCount,
	winnerIds: row.winnerIds,
	createdBy: row.createdBy
});

const giveawayPayload = (id: string): Prisma.JsonFilter<'ScheduledJob'> => ({ path: ['giveawayId'], equals: id });

export class GiveawayService implements Stoppable {
	public readonly name = '나눔 카드 갱신';

	private readonly timers = new KeyedTimers('나눔 카드 갱신 디바운스');
	private readonly lastCardUpdate = new Map<string, number>();
	/** 같은 프로세스에서 중복 마감을 막기 위한 잠금 집합 */
	private readonly finalizing = new Set<string>();
	private readonly inflight = new Set<Promise<void>>();
	private stopped = false;

	public constructor(private readonly deps: GiveawayServiceDeps) {
		deps.scheduler.register(GIVEAWAY_KIND, (job) => this.handle(job));
	}

	private now(): Date {
		return this.deps.now?.() ?? new Date();
	}

	private rng(max: number): number {
		return (this.deps.randomInt ?? randomInt)(max);
	}

	public async start(input: StartGiveawayInput): Promise<{ id: string }> {
		const prize = giveawayPrizeSchema.safeParse(input.prize);
		if (!prize.success) throw new AppError('invalid_input', prize.error.issues[0]?.message ?? '상품이 올바르지 않아요.', { ephemeral: true });
		const winners = giveawayWinnerCountSchema.safeParse(input.winnerCount);
		if (!winners.success)
			throw new AppError('invalid_input', winners.error.issues[0]?.message ?? '당첨자 수가 올바르지 않아요.', { ephemeral: true });
		const endProblem = checkGiveawayEnd(this.now(), input.endsAt);
		if (endProblem) throw new AppError('invalid_input', endProblem, { ephemeral: true });
		const problem = await this.deps.discord.checkChannel(input.guildId, input.channelId);
		if (problem) throw new AppError('invalid_input', problem, { ephemeral: true });

		const requirements = { version: 1 as const, conditions: input.conditions };
		if (!parseGiveawayRequirements(requirements)) throw new AppError('invalid_input', '참여 조건이 올바르지 않아요.', { ephemeral: true });

		const id = await this.deps.db.$transaction(async (tx) => {
			await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${GIVEAWAY_KIND}:${input.guildId}`}))`;
			const running = await tx.giveaway.count({ where: { guildId: input.guildId, status: 'running' } });
			if (running >= GIVEAWAY_MAX_RUNNING) {
				throw new AppError('conflict', `진행 중인 나눔은 서버당 최대 ${GIVEAWAY_MAX_RUNNING}개예요.`, { ephemeral: true });
			}
			const row = await tx.giveaway.create({
				data: {
					guildId: input.guildId,
					channelId: input.channelId,
					prize: prize.data,
					winnerCount: winners.data,
					endsAt: input.endsAt,
					requirements: requirements as unknown as Prisma.InputJsonObject,
					createdBy: input.userId
				}
			});
			await tx.scheduledJob.create({
				data: {
					guildId: input.guildId,
					kind: GIVEAWAY_KIND,
					runAt: input.endsAt,
					payload: { giveawayId: row.id },
					createdBy: input.userId
				}
			});
			return row.id;
		});

		try {
			const messageId = await this.deps.discord.publish(
				input.channelId,
				toCard(
					{
						id,
						guildId: input.guildId,
						prize: prize.data,
						winnerCount: winners.data,
						endsAt: input.endsAt,
						status: 'running',
						winnerIds: [],
						createdBy: input.userId
					},
					input.conditions,
					0
				)
			);
			await this.deps.db.giveaway.update({ where: { id }, data: { messageId } });
		} catch (error) {
			// 카드를 못 올렸으면 참여할 곳이 없으니 나눔과 마감 작업을 되돌려요
			await this.deps.db.scheduledJob
				.deleteMany({ where: { kind: GIVEAWAY_KIND, status: 'pending', payload: giveawayPayload(id) } })
				.catch(() => undefined);
			await this.deps.db.giveaway.delete({ where: { id } }).catch(() => undefined);
			this.deps.logger.warn(`[giveaway] 카드 게시 실패 (guild ${input.guildId}): ${error instanceof Error ? error.message : String(error)}`);
			throw new AppError('unavailable', '참여 카드를 올리지 못했어요. 봇의 채널 권한을 확인해 주세요.', { ephemeral: true });
		}
		return { id };
	}

	/* ------------------------------------------------------------ 참여 */

	/** 참여 버튼 — 조건을 확인하고 한 번만 넣어요 (중복은 기본 키가 막아요) */
	public async enter(giveawayId: string, guildId: string, userId: string, member: GiveawayMemberFacts): Promise<EnterResult> {
		const row = await this.deps.db.giveaway.findUnique({ where: { id: giveawayId } });
		if (!row || row.guildId !== guildId || row.status !== 'running' || row.endsAt.getTime() <= this.now().getTime()) return { kind: 'closed' };

		const existing = await this.deps.db.giveawayEntry.findUnique({ where: { giveawayId_userId: { giveawayId, userId } } });
		if (existing) return { kind: 'already' };

		const requirements = parseGiveawayRequirements(row.requirements);
		if (!requirements) {
			this.deps.logger.error(`[giveaway] 조건 JSON을 읽을 수 없어요 (giveaway ${giveawayId})`);
			return { kind: 'ineligible', reasons: ['참여 조건을 확인할 수 없어요. 관리자에게 알려 주세요.'] };
		}
		const eligibility = evaluateGiveawayConditions(requirements.conditions, member, this.now());
		if (!eligibility.ok) return { kind: 'ineligible', reasons: eligibility.reasons };

		const { count } = await this.deps.db.giveawayEntry.createMany({ data: [{ giveawayId, userId }], skipDuplicates: true });
		if (count === 0) return { kind: 'already' };
		this.requestCardUpdate(giveawayId);
		return { kind: 'entered' };
	}

	/** 참여 취소 — 마감 전에만 돼요 */
	public async leave(giveawayId: string, guildId: string, userId: string): Promise<boolean> {
		const row = await this.deps.db.giveaway.findUnique({ where: { id: giveawayId } });
		// 마감 시각이 지나면 추첨 작업이 아직 안 돌았어도 status는 running이에요. 참여(enter)와 같은 기준으로 막아요.
		if (!row || row.guildId !== guildId || row.status !== 'running' || row.endsAt.getTime() <= this.now().getTime()) return false;
		const { count } = await this.deps.db.giveawayEntry.deleteMany({ where: { giveawayId, userId } });
		if (count > 0) this.requestCardUpdate(giveawayId);
		return count > 0;
	}

	/* ------------------------------------------------------------ 카드 갱신 (10초 스로틀) */

	/**
	 * 참여자 수가 바뀌었다고 알려요. 마지막 수정 후 10초가 지났으면 바로, 아니면 남은 시간만큼 기다렸다가 한 번만 고쳐요.
	 * 대기 중에 더 눌려도 타이머는 하나라서 편집은 10초에 최대 한 번이에요.
	 */
	public requestCardUpdate(giveawayId: string): void {
		if (this.stopped || this.timers.has(giveawayId)) return;
		const interval = this.deps.cardUpdateIntervalMs ?? GIVEAWAY_CARD_UPDATE_INTERVAL_MS;
		const wait = Math.max(0, (this.lastCardUpdate.get(giveawayId) ?? -Infinity) + interval - this.now().getTime());
		this.timers.set(giveawayId, () => this.track(this.refreshCard(giveawayId)), wait);
	}

	private track(promise: Promise<void>): Promise<void> {
		const tracked = promise.finally(() => this.inflight.delete(tracked));
		this.inflight.add(tracked);
		return tracked;
	}

	private async refreshCard(giveawayId: string): Promise<void> {
		try {
			this.lastCardUpdate.set(giveawayId, this.now().getTime());
			const row = await this.deps.db.giveaway.findUnique({ where: { id: giveawayId } });
			if (!row || row.status !== 'running' || !row.messageId) return;
			const requirements = parseGiveawayRequirements(row.requirements);
			const entryCount = await this.deps.db.giveawayEntry.count({ where: { giveawayId } });
			await this.deps.discord.updateCard(row.channelId, row.messageId, toCard(row, requirements?.conditions ?? [], entryCount));
		} catch (error) {
			this.deps.logger.warn(`[giveaway] 카드 갱신 실패 (giveaway ${giveawayId}): ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	public async stop(): Promise<void> {
		this.stopped = true;
		await this.timers.stop();
		await Promise.all([...this.inflight]);
	}

	/* ------------------------------------------------------------ 마감 */

	/** 스케줄러 핸들러 — 마감 시각에 불려요. 이미 끝났으면 발표가 남았는지만 확인해요 */
	private async handle(job: ScheduledJob): Promise<void> {
		const payload = parseGiveawayJobPayload(job.payload);
		if (!payload) {
			this.deps.logger.warn(`[giveaway] 잘못된 작업 payload (job ${job.id})`);
			return;
		}
		await this.finalize(payload.giveawayId, true);
	}

	/** 지금 마감 (/나눔 종료) */
	public async endNow(guildId: string, giveawayId: string): Promise<'ended' | 'not-found' | 'not-running'> {
		const row = await this.deps.db.giveaway.findUnique({ where: { id: giveawayId } });
		if (!row || row.guildId !== guildId) return 'not-found';
		if (row.status !== 'running') return 'not-running';
		try {
			await this.finalize(giveawayId, false);
		} catch (error) {
			// 발표만 실패한 경우 — 스케줄러가 곧 다시 시도하도록 대기 중인 작업을 앞당겨요
			await this.deps.db.scheduledJob.updateMany({
				where: { kind: GIVEAWAY_KIND, status: 'pending', payload: giveawayPayload(giveawayId) },
				data: { runAt: new Date(this.now().getTime() + 30_000) }
			});
			throw new AppError('unavailable', '추첨은 끝났지만 결과를 올리지 못했어요. 잠시 뒤 자동으로 다시 시도해요.', {
				ephemeral: true,
				cause: error
			});
		}
		return 'ended';
	}

	/**
	 * 추첨과 발표. 상태를 running → ended로 바꾸는 것이 한 번만 성공하도록 막아서 중복 추첨을 막고,
	 * 발표(announcedAt)가 비어 있는 ended는 재시도에서 발표만 다시 해요.
	 */
	private async finalize(giveawayId: string, fromScheduler: boolean): Promise<void> {
		if (this.finalizing.has(giveawayId)) {
			if (fromScheduler) throw new Error('다른 경로에서 마감 처리 중이에요.');
			return;
		}
		this.finalizing.add(giveawayId);
		try {
			const row = await this.deps.db.giveaway.findUnique({ where: { id: giveawayId } });
			if (!row || row.status === 'cancelled') return;
			const requirements = parseGiveawayRequirements(row.requirements);
			const conditions = requirements?.conditions ?? [];

			let current = row;
			if (row.status === 'running') {
				const entries = await this.deps.db.giveawayEntry.findMany({ where: { giveawayId }, select: { userId: true } });
				const eligible = await this.eligibleEntrants(
					row.guildId,
					entries.map((e) => e.userId),
					requirements
				);
				const winnerIds = drawWinners(eligible, row.winnerCount, (max) => this.rng(max));
				const { count } = await this.deps.db.giveaway.updateMany({
					where: { id: giveawayId, status: 'running' },
					data: { status: 'ended', winnerIds, entryCount: entries.length, eligibleCount: eligible.length, endedAt: this.now() }
				});
				if (count === 0) return;
				current = { ...row, status: 'ended', winnerIds, entryCount: entries.length, eligibleCount: eligible.length };
			} else if (row.announcedAt) {
				return;
			}

			const card = toCard(current, conditions, current.entryCount ?? 0);
			if (current.messageId) {
				await this.deps.discord.updateCard(current.channelId, current.messageId, card).catch((error: unknown) => {
					this.deps.logger.warn(
						`[giveaway] 마감 카드 수정 실패 (giveaway ${giveawayId}): ${error instanceof Error ? error.message : String(error)}`
					);
				});
			}
			const result = await this.deps.discord.announce(current.channelId, current.messageId, card, 'end', current.winnerIds);
			if (result === 'gone') this.deps.logger.warn(`[giveaway] 발표할 채널이 없어요 (giveaway ${giveawayId})`);
			await this.deps.db.giveaway.update({ where: { id: giveawayId }, data: { announcedAt: this.now() } });
		} finally {
			this.finalizing.delete(giveawayId);
			this.lastCardUpdate.delete(giveawayId);
		}
	}

	/** 참여자 중 지금도 서버에 있고 조건을 통과하는 사람 — 마감 시점에 역할을 잃었거나 나갔으면 빠져요 */
	private async eligibleEntrants(
		guildId: string,
		userIds: readonly string[],
		requirements: ReturnType<typeof parseGiveawayRequirements>
	): Promise<string[]> {
		// 조건을 읽을 수 없으면 안전한 쪽으로, 아무도 통과시키지 않아요
		if (!requirements) return [];
		const members = await this.deps.discord.fetchMembers(guildId, userIds);
		const now = this.now();
		return userIds.filter((userId) => {
			const facts = members.get(userId);
			return facts !== undefined && evaluateGiveawayConditions(requirements.conditions, facts, now).ok;
		});
	}

	/* ------------------------------------------------------------ 취소·다시 뽑기·목록 */

	public async cancel(guildId: string, giveawayId: string): Promise<'cancelled' | 'not-found' | 'not-running'> {
		const row = await this.deps.db.giveaway.findUnique({ where: { id: giveawayId } });
		if (!row || row.guildId !== guildId) return 'not-found';
		const { count } = await this.deps.db.giveaway.updateMany({
			where: { id: giveawayId, status: 'running' },
			data: { status: 'cancelled', endedAt: this.now() }
		});
		if (count === 0) return 'not-running';
		await this.deps.db.scheduledJob.deleteMany({ where: { kind: GIVEAWAY_KIND, status: 'pending', payload: giveawayPayload(giveawayId) } });
		if (row.messageId) {
			const requirements = parseGiveawayRequirements(row.requirements);
			const entryCount = await this.deps.db.giveawayEntry.count({ where: { giveawayId } });
			await this.deps.discord
				.updateCard(row.channelId, row.messageId, toCard({ ...row, status: 'cancelled' }, requirements?.conditions ?? [], entryCount))
				.catch(() => undefined);
		}
		return 'cancelled';
	}

	/** 끝난 나눔에서 새 당첨자를 더 뽑아요 — 이미 뽑힌 사람은 빼고, 조건은 지금 다시 확인해요 */
	public async reroll(guildId: string, giveawayId: string, count: number): Promise<{ winnerIds: string[] }> {
		const winners = giveawayWinnerCountSchema.safeParse(count);
		if (!winners.success)
			throw new AppError('invalid_input', winners.error.issues[0]?.message ?? '당첨자 수가 올바르지 않아요.', { ephemeral: true });
		const row = await this.deps.db.giveaway.findUnique({ where: { id: giveawayId } });
		if (!row || row.guildId !== guildId) throw new AppError('not_found', '그 나눔을 찾을 수 없어요.', { ephemeral: true });
		if (row.status !== 'ended') throw new AppError('conflict', '끝난 나눔에서만 다시 뽑을 수 있어요.', { ephemeral: true });

		const requirements = parseGiveawayRequirements(row.requirements);
		const entries = await this.deps.db.giveawayEntry.findMany({ where: { giveawayId }, select: { userId: true } });
		const previous = new Set(row.winnerIds);
		const pool = await this.eligibleEntrants(
			guildId,
			entries.map((e) => e.userId).filter((id) => !previous.has(id)),
			requirements
		);
		const drawn = drawWinners(pool, winners.data, (max) => this.rng(max));
		if (drawn.length === 0) throw new AppError('conflict', '새로 뽑을 수 있는 참여자가 없어요.', { ephemeral: true });

		const all = [...row.winnerIds, ...drawn];
		await this.deps.db.giveaway.update({ where: { id: giveawayId }, data: { winnerIds: all } });
		const card = toCard({ ...row, winnerIds: all }, requirements?.conditions ?? [], row.entryCount ?? entries.length);
		if (row.messageId) await this.deps.discord.updateCard(row.channelId, row.messageId, card).catch(() => undefined);
		await this.deps.discord.announce(row.channelId, row.messageId, card, 'reroll', drawn);
		return { winnerIds: drawn };
	}

	/** 자동완성용 — 최근 순으로 상태에 맞는 나눔 */
	public async listForAutocomplete(guildId: string, statuses: readonly GiveawayStatus[], limit = 25): Promise<GiveawaySummary[]> {
		const rows = await this.deps.db.giveaway.findMany({
			where: { guildId, status: { in: [...statuses] } },
			orderBy: { createdAt: 'desc' },
			take: limit
		});
		return rows.map((r) => ({ id: r.id, prize: r.prize, status: r.status, endsAt: r.endsAt }));
	}

	/** 서버를 나가면 진행 중이던 나눔과 마감 작업을 지워요 (Giveaway는 Guild 삭제로 함께 지워져요) */
	public async purgeGuild(guildId: string): Promise<void> {
		await this.deps.db.scheduledJob.deleteMany({ where: { guildId, kind: GIVEAWAY_KIND, status: 'pending' } });
		await this.deps.db.giveaway.updateMany({ where: { guildId, status: 'running' }, data: { status: 'cancelled', endedAt: this.now() } });
	}
}

export function createGiveawayService(deps: GiveawayServiceDeps): GiveawayService {
	return new GiveawayService(deps);
}
