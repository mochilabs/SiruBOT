import { describe, expect, it, vi } from 'vitest';
import type { ScheduledJob } from '@sirubot/prisma';
import { SCHEDULED_MESSAGE_KIND } from '@sirubot/utils/scheduledMessage';
import { AppError } from '../../../lib/appError.ts';
import { JOB_MAX_ATTEMPTS } from '../../../services/guildJobScheduler.ts';
import { scheduledMessageSendOptions } from '../discord/scheduledMessageDiscord.ts';
import { ScheduledMessageService, type ChannelProblem } from './scheduledMessageService.ts';

const NOW = new Date('2026-12-01T00:00:00Z');
const kst = (text: string) => new Date(`${text}+09:00`);
const GUILD = '100000000000000001';
const CHANNEL = '200000000000000001';
const SERIES = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

const makeJob = (over: Partial<ScheduledJob> = {}): ScheduledJob => ({
	id: 'j1',
	guildId: GUILD,
	kind: SCHEDULED_MESSAGE_KIND,
	runAt: NOW,
	payload: { seriesId: SERIES, channelId: CHANNEL, content: '안녕하세요' },
	status: 'running',
	attempts: 0,
	lockedBy: 'p1',
	lockedAt: NOW,
	lastError: null,
	createdBy: 'creator',
	createdAt: NOW,
	updatedAt: NOW,
	...over
});

function setup(
	opts: {
		active?: ScheduledJob[];
		pendingNext?: boolean;
		disabledModules?: string[];
		problem?: ChannelProblem | null;
		settings?: { maxActive: number; minIntervalMinutes: number };
	} = {}
) {
	const scheduledJob = {
		findMany: vi.fn(async () => opts.active ?? []),
		findFirst: vi.fn(async () => (opts.pendingNext ? { id: 'next' } : null)),
		create: vi.fn(async ({ data }: { data: object }) => ({ id: 'new', ...data })),
		deleteMany: vi.fn(async () => ({ count: 1 }))
	};
	const db = {
		scheduledJob,
		scheduledMessageSettings: { findUnique: vi.fn(async () => opts.settings ?? null) },
		guild: { findUnique: vi.fn(async () => ({ disabledModules: opts.disabledModules ?? [] })) },
		$executeRaw: vi.fn(async () => 0),
		$transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db))
	};
	const discord = {
		checkChannel: vi.fn(async () => opts.problem ?? null),
		send: vi.fn(async () => undefined),
		notifyCreator: vi.fn(async () => true)
	};
	const scheduler = { register: vi.fn() };
	const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
	const service = new ScheduledMessageService({ db: db as never, scheduler, discord, logger, now: () => NOW });
	return { db, discord, scheduler, service, logger };
}

const activeRow = (i: number, channelId = CHANNEL, runAt = kst('2026-12-25T09:00:00')): ScheduledJob =>
	makeJob({
		id: `a${i}`,
		status: 'pending',
		runAt,
		payload: { seriesId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, channelId, content: `예약 ${i}` }
	});

describe('핸들러 등록', () => {
	it('scheduled-message kind로 스케줄러에 등록해요', () => {
		const { scheduler } = setup();
		expect(scheduler.register).toHaveBeenCalledWith(SCHEDULED_MESSAGE_KIND, expect.any(Function));
	});
});

describe('handle — 전송', () => {
	it('한 번짜리 예약은 메시지를 보내고 다음 행을 만들지 않아요', async () => {
		const { service, discord, db } = setup();
		await service.handle(makeJob());
		expect(discord.checkChannel).toHaveBeenCalledWith(GUILD, CHANNEL);
		expect(discord.send).toHaveBeenCalledWith(CHANNEL, '안녕하세요');
		expect(db.scheduledJob.create).not.toHaveBeenCalled();
	});

	it('반복 예약은 보내기 전에 다음 행을 넣어요 (지금이 09:00 KST면 다음 날 09:00)', async () => {
		const { service, discord, db } = setup();
		const job = makeJob({
			runAt: kst('2026-12-01T09:00:00'),
			payload: { seriesId: SERIES, channelId: CHANNEL, content: '매일', recurrence: { type: 'daily', time: '09:00' } }
		});
		const order: string[] = [];
		db.scheduledJob.create.mockImplementation(async (args: { data: object }) => {
			order.push('create');
			return { id: 'new', ...args.data };
		});
		discord.send.mockImplementation(async () => {
			order.push('send');
		});
		await service.handle({ ...job, runAt: new Date(NOW.getTime() - 60_000) });
		const created = db.scheduledJob.create.mock.calls[0]![0] as { data: { runAt: Date; guildId: string; kind: string; createdBy: string } };
		expect(created.data.runAt).toEqual(kst('2026-12-02T09:00:00'));
		expect(created.data).toMatchObject({ guildId: GUILD, kind: SCHEDULED_MESSAGE_KIND, createdBy: 'creator' });
		expect(order).toEqual(['create', 'send']);
	});

	it('다음 회차가 이미 있으면(재시도·재실행) 또 넣지 않아요', async () => {
		const { service, db } = setup({ pendingNext: true });
		await service.handle(
			makeJob({ attempts: 1, payload: { seriesId: SERIES, channelId: CHANNEL, content: '매일', recurrence: { type: 'daily', time: '09:00' } } })
		);
		expect(db.scheduledJob.create).not.toHaveBeenCalled();
	});

	it('3시간 넘게 밀린 반복 회차는 보내지 않고 다음 회차만 잡아요', async () => {
		const { service, db, discord } = setup();
		await service.handle(
			makeJob({
				runAt: new Date(NOW.getTime() - 4 * 60 * 60_000),
				payload: { seriesId: SERIES, channelId: CHANNEL, content: '매일', recurrence: { type: 'daily', time: '09:00' } }
			})
		);
		expect(db.scheduledJob.create).toHaveBeenCalledTimes(1);
		expect(discord.send).not.toHaveBeenCalled();
	});

	it('커뮤니티 모듈이 꺼진 서버에는 보내지 않아요', async () => {
		const { service, discord } = setup({ disabledModules: ['community'] });
		await service.handle(makeJob());
		expect(discord.send).not.toHaveBeenCalled();
	});

	it('payload가 깨졌으면 던져서 스케줄러가 재시도·failed로 닫게 해요', async () => {
		const { service, discord } = setup();
		await expect(service.handle(makeJob({ payload: { nope: 1 } }))).rejects.toThrow();
		expect(discord.send).not.toHaveBeenCalled();
	});
});

describe('handle — 채널 권한 실패', () => {
	it('봇에게 SendMessages가 없으면 보내지 않고 던져요 (재시도 규칙은 스케줄러가 맡아요)', async () => {
		const { service, discord } = setup({ problem: 'no-send' });
		await expect(service.handle(makeJob({ attempts: 0 }))).rejects.toThrow(/메시지 보내기/);
		expect(discord.send).not.toHaveBeenCalled();
		expect(discord.notifyCreator).not.toHaveBeenCalled();
	});

	it('ViewChannel이 없어도 같은 방식으로 실패해요', async () => {
		const { service, discord } = setup({ problem: 'no-view' });
		await expect(service.handle(makeJob())).rejects.toThrow(/채널 보기/);
		expect(discord.send).not.toHaveBeenCalled();
	});

	it('마지막 시도에서 실패하면 만든 사람에게 DM으로 이유를 알리고 던져요', async () => {
		const { service, discord } = setup({ problem: 'no-send' });
		await expect(service.handle(makeJob({ attempts: JOB_MAX_ATTEMPTS - 1 }))).rejects.toThrow();
		expect(discord.notifyCreator).toHaveBeenCalledTimes(1);
		const [userId, guildId, text] = discord.notifyCreator.mock.calls[0] as unknown as [string, string, string];
		expect(userId).toBe('creator');
		expect(guildId).toBe(GUILD);
		expect(text).toContain(`<#${CHANNEL}>`);
		expect(text).toContain('메시지 보내기');
	});

	it('전송이 던져도 마지막 시도라면 알리고, DM이 막혀 있어도 원래 오류를 던져요', async () => {
		const { service, discord, logger } = setup();
		discord.send.mockRejectedValue(new Error('Missing Access'));
		discord.notifyCreator.mockResolvedValue(false);
		await expect(service.handle(makeJob({ attempts: JOB_MAX_ATTEMPTS - 1 }))).rejects.toThrow('Missing Access');
		expect(logger.warn).toHaveBeenCalled();
	});
});

describe('create — 상한·간격·본문', () => {
	const input = {
		guildId: GUILD,
		userId: 'creator',
		channelId: CHANNEL,
		content: '안녕',
		runAt: kst('2026-12-25T09:00:00'),
		repeat: 'none' as const
	};

	it('활성 예약이 25개면 만들지 않아요', async () => {
		const { service, db } = setup({ active: Array.from({ length: 25 }, (_, i) => activeRow(i, `3${String(i).padStart(17, '0')}`)) });
		await expect(service.create(input)).rejects.toMatchObject({ kind: 'conflict', code: 'limit' });
		expect(db.scheduledJob.create).not.toHaveBeenCalled();
	});

	it('서버가 상한을 올리면 25개가 넘어도 만들어요', async () => {
		const { service, db } = setup({
			active: Array.from({ length: 25 }, (_, i) => activeRow(i, `3${String(i).padStart(17, '0')}`)),
			settings: { maxActive: 30, minIntervalMinutes: 10 }
		});
		await service.create(input);
		expect(db.scheduledJob.create).toHaveBeenCalledTimes(1);
	});

	it('같은 채널에서 10분 안쪽이면 거부해요', async () => {
		const { service, db } = setup({ active: [activeRow(1, CHANNEL, kst('2026-12-25T09:05:00'))] });
		await expect(service.create(input)).rejects.toMatchObject({ code: 'interval' });
		expect(db.scheduledJob.create).not.toHaveBeenCalled();
	});

	it('통과하면 ScheduledJob 한 행을 만들고 반복 규칙을 payload에 담아요', async () => {
		const { service, db } = setup();
		const entry = await service.create({ ...input, repeat: 'weekly' });
		const data = (db.scheduledJob.create.mock.calls[0]![0] as { data: { payload: Record<string, unknown>; runAt: Date; createdBy: string } })
			.data;
		expect(data.runAt).toEqual(input.runAt);
		expect(data.createdBy).toBe('creator');
		expect(data.payload).toMatchObject({ channelId: CHANNEL, content: '안녕', recurrence: { type: 'weekly', weekday: 5, time: '09:00' } });
		expect(entry.seriesId).toBe(data.payload.seriesId);
		expect(db.$executeRaw).toHaveBeenCalled();
	});

	it('@everyone/@here가 들어간 본문은 저장 전에 거부해요', async () => {
		const { service, db, discord } = setup();
		await expect(service.create({ ...input, content: '@everyone 공지예요' })).rejects.toBeInstanceOf(AppError);
		await expect(service.create({ ...input, content: '모두 @here' })).rejects.toBeInstanceOf(AppError);
		expect(db.scheduledJob.create).not.toHaveBeenCalled();
		expect(discord.checkChannel).not.toHaveBeenCalled();
	});

	it('봇이 채널을 쓸 수 없으면 만들 때 바로 알려요', async () => {
		const { service, db } = setup({ problem: 'no-send' });
		await expect(service.create(input)).rejects.toMatchObject({ kind: 'invalid_input' });
		expect(db.scheduledJob.create).not.toHaveBeenCalled();
	});
});

describe('allowedMentions', () => {
	it('전송 옵션은 everyone을 파싱하지 않아요 (본문에 남은 @everyone도 핑되지 않아요)', () => {
		const options = scheduledMessageSendOptions('@everyone 테스트 <@&123456789012345678>');
		expect(options.allowedMentions?.parse).toEqual(['users', 'roles']);
		expect(options.allowedMentions?.parse).not.toContain('everyone');
	});
});

describe('list / remove / purgeGuild', () => {
	it('같은 예약의 회차는 대기 행을 대표로 한 줄로 묶어요', async () => {
		const running = makeJob({
			id: 'r',
			status: 'running',
			runAt: kst('2026-12-01T09:00:00'),
			payload: { seriesId: SERIES, channelId: CHANNEL, content: '매일', recurrence: { type: 'daily', time: '09:00' } }
		});
		const pending = { ...running, id: 'p', status: 'pending' as const, runAt: kst('2026-12-02T09:00:00') };
		const { service, db } = setup();
		db.scheduledJob.findMany.mockResolvedValue([running, pending]);
		const list = await service.list(GUILD);
		expect(list).toHaveLength(1);
		expect(list[0]).toMatchObject({ seriesId: SERIES, status: 'pending', runAt: pending.runAt });
	});

	it('삭제는 길드·kind·예약 ID로만 지워요', async () => {
		const { service, db } = setup();
		expect(await service.remove(GUILD, SERIES)).toBe(true);
		expect(db.scheduledJob.deleteMany).toHaveBeenCalledWith({
			where: {
				guildId: GUILD,
				kind: SCHEDULED_MESSAGE_KIND,
				status: { in: ['pending', 'failed', 'done'] },
				payload: { path: ['seriesId'], equals: SERIES }
			}
		});
		db.scheduledJob.deleteMany.mockResolvedValue({ count: 0 });
		expect(await service.remove(GUILD, SERIES)).toBe(false);
	});

	it('서버를 나가면 그 서버의 예약을 지워요', async () => {
		const { service, db } = setup();
		await service.purgeGuild(GUILD);
		expect(db.scheduledJob.deleteMany).toHaveBeenCalledWith({
			where: { guildId: GUILD, kind: SCHEDULED_MESSAGE_KIND, status: { in: ['pending', 'failed', 'done'] } }
		});
	});
});
