import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GiveawayCondition, GiveawayMemberFacts } from '@sirubot/utils/giveaway';
import { AppError } from '../../../lib/appError.ts';
import { GiveawayService, type GiveawayDiscordPort, type GiveawayServiceDeps } from './giveawayService.ts';

const GUILD = '100000000000000001';
const CHANNEL = '200000000000000001';
const ROLE = '300000000000000001';
const NOW = new Date('2026-11-22T00:00:00Z');
const user = (n: number) => `4000000000000000${String(n).padStart(2, '0')}`;

interface Row {
	id: string;
	guildId: string;
	channelId: string;
	messageId: string | null;
	prize: string;
	winnerCount: number;
	endsAt: Date;
	requirements: unknown;
	status: 'running' | 'ended' | 'cancelled';
	winnerIds: string[];
	entryCount: number | null;
	eligibleCount: number | null;
	endedAt: Date | null;
	announcedAt: Date | null;
	createdBy: string;
}

/** 서비스가 쓰는 prisma 조각만 흉내 낸 메모리 DB */
function fakeDb() {
	const giveaways = new Map<string, Row>();
	const entries = new Map<string, Set<string>>();
	const jobs: { id: string; kind: string; status: string; runAt: Date; payload: { giveawayId: string } }[] = [];
	let seq = 0;
	const matchStatus = (row: Row, where: { status?: string | { in: string[] } }) =>
		!where.status || (typeof where.status === 'string' ? row.status === where.status : where.status.in.includes(row.status));
	const db = {
		$transaction: async (fn: (tx: unknown) => unknown) => fn(db),
		$executeRaw: async () => 0,
		giveaway: {
			count: async ({ where }: { where: { guildId: string; status: string } }) =>
				[...giveaways.values()].filter((r) => r.guildId === where.guildId && matchStatus(r, where)).length,
			create: async ({ data }: { data: Partial<Row> }) => {
				const row = {
					messageId: null,
					winnerIds: [],
					entryCount: null,
					eligibleCount: null,
					endedAt: null,
					announcedAt: null,
					status: 'running',
					...data,
					id: `g${++seq}`
				} as Row;
				giveaways.set(row.id, row);
				return row;
			},
			findUnique: async ({ where }: { where: { id: string } }) => giveaways.get(where.id) ?? null,
			findMany: async ({ where }: { where: { guildId: string; status: { in: string[] } } }) =>
				[...giveaways.values()].filter((r) => r.guildId === where.guildId && matchStatus(r, where)),
			update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
				const row = giveaways.get(where.id)!;
				Object.assign(row, data);
				return row;
			},
			updateMany: async ({ where, data }: { where: { id?: string; guildId?: string; status?: string }; data: Partial<Row> }) => {
				const hit = [...giveaways.values()].filter(
					(r) => (!where.id || r.id === where.id) && (!where.guildId || r.guildId === where.guildId) && matchStatus(r, where)
				);
				hit.forEach((r) => Object.assign(r, data));
				return { count: hit.length };
			},
			delete: async ({ where }: { where: { id: string } }) => giveaways.delete(where.id)
		},
		giveawayEntry: {
			findUnique: async ({ where }: { where: { giveawayId_userId: { giveawayId: string; userId: string } } }) =>
				entries.get(where.giveawayId_userId.giveawayId)?.has(where.giveawayId_userId.userId) ? { ...where.giveawayId_userId } : null,
			createMany: async ({ data }: { data: { giveawayId: string; userId: string }[] }) => {
				let count = 0;
				for (const d of data) {
					const set = entries.get(d.giveawayId) ?? new Set<string>();
					if (!set.has(d.userId)) count++;
					set.add(d.userId);
					entries.set(d.giveawayId, set);
				}
				return { count };
			},
			deleteMany: async ({ where }: { where: { giveawayId: string; userId: string } }) => ({
				count: entries.get(where.giveawayId)?.delete(where.userId) ? 1 : 0
			}),
			findMany: async ({ where }: { where: { giveawayId: string } }) =>
				[...(entries.get(where.giveawayId) ?? [])].map((userId) => ({ userId })),
			count: async ({ where }: { where: { giveawayId: string } }) => entries.get(where.giveawayId)?.size ?? 0
		},
		scheduledJob: {
			create: async ({ data }: { data: { kind: string; runAt: Date; payload: { giveawayId: string } } }) => {
				jobs.push({ id: `j${++seq}`, status: 'pending', ...data });
			},
			deleteMany: async ({ where }: { where: { kind: string; payload?: { equals: string } } }) => {
				const before = jobs.length;
				for (let i = jobs.length - 1; i >= 0; i--) {
					const j = jobs[i]!;
					if (j.kind === where.kind && (!where.payload || j.payload.giveawayId === where.payload.equals)) jobs.splice(i, 1);
				}
				return { count: before - jobs.length };
			},
			updateMany: async ({ where, data }: { where: { payload: { equals: string } }; data: { runAt: Date } }) => {
				const hit = jobs.filter((j) => j.payload.giveawayId === where.payload.equals);
				hit.forEach((j) => (j.runAt = data.runAt));
				return { count: hit.length };
			}
		}
	};
	return { db, giveaways, entries, jobs };
}

const facts = (over: Partial<GiveawayMemberFacts> = {}): GiveawayMemberFacts => ({
	roleIds: [ROLE],
	joinedAt: new Date(NOW.getTime() - 30 * 86_400_000),
	accountCreatedAt: new Date(NOW.getTime() - 400 * 86_400_000),
	...over
});

function setup(options: { members?: Map<string, GiveawayMemberFacts>; rng?: (max: number) => number } = {}) {
	const fake = fakeDb();
	let clock = NOW.getTime();
	const members = options.members ?? new Map<string, GiveawayMemberFacts>();
	const discord = {
		checkChannel: vi.fn(async () => null),
		publish: vi.fn(async () => 'msg-1'),
		updateCard: vi.fn(async () => 'ok' as const),
		announce: vi.fn(async () => 'ok' as const),
		fetchMembers: vi.fn(async () => members)
	} satisfies GiveawayDiscordPort;
	let handler: ((job: unknown) => Promise<void>) | undefined;
	const deps: GiveawayServiceDeps = {
		db: fake.db as never,
		scheduler: { register: (_kind, h) => void (handler = h as never) },
		discord,
		logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
		now: () => new Date(clock),
		randomInt: options.rng ?? (() => 0)
	};
	const service = new GiveawayService(deps);
	return {
		...fake,
		discord,
		service,
		members,
		advance: (ms: number) => void (clock += ms),
		runJob: (giveawayId: string) => handler!({ id: 'job', payload: { giveawayId } })
	};
}

const startInput = (over: Partial<Parameters<GiveawayService['start']>[0]> = {}) => ({
	guildId: GUILD,
	channelId: CHANNEL,
	userId: user(0),
	prize: '니트로',
	winnerCount: 2,
	endsAt: new Date(NOW.getTime() + 3_600_000),
	conditions: [] as GiveawayCondition[],
	...over
});

describe('GiveawayService.start', () => {
	it('행과 마감 작업을 만들고 카드를 올린 뒤 messageId를 저장해요', async () => {
		const t = setup();
		const { id } = await t.service.start(startInput());
		expect(t.giveaways.get(id)).toMatchObject({ status: 'running', messageId: 'msg-1', prize: '니트로' });
		expect(t.jobs).toHaveLength(1);
		expect(t.jobs[0]).toMatchObject({ kind: 'giveaway_end', payload: { giveawayId: id } });
	});

	it('마감이 너무 가깝거나 상품이 비면 거절해요', async () => {
		const t = setup();
		await expect(t.service.start(startInput({ endsAt: new Date(NOW.getTime() + 10_000) }))).rejects.toBeInstanceOf(AppError);
		await expect(t.service.start(startInput({ prize: '  ' }))).rejects.toBeInstanceOf(AppError);
		expect(t.giveaways.size).toBe(0);
	});

	it('동시에 10개까지만 열 수 있어요', async () => {
		const t = setup();
		for (let i = 0; i < 10; i++) await t.service.start(startInput());
		await expect(t.service.start(startInput())).rejects.toMatchObject({ kind: 'conflict' });
	});

	it('카드를 못 올리면 행과 작업을 되돌려요', async () => {
		const t = setup();
		t.discord.publish.mockRejectedValueOnce(new Error('Missing Permissions'));
		await expect(t.service.start(startInput())).rejects.toBeInstanceOf(AppError);
		expect(t.giveaways.size).toBe(0);
		expect(t.jobs).toHaveLength(0);
	});
});

describe('GiveawayService.enter', () => {
	it('조건을 통과하면 한 번만 들어가고 다시 누르면 already예요', async () => {
		const t = setup();
		const { id } = await t.service.start(startInput({ conditions: [{ type: 'requiredRoles', roleIds: [ROLE], match: 'any' }] }));
		expect(await t.service.enter(id, GUILD, user(1), facts())).toEqual({ kind: 'entered' });
		expect(await t.service.enter(id, GUILD, user(1), facts())).toEqual({ kind: 'already' });
		expect(t.entries.get(id)?.size).toBe(1);
	});

	it('조건을 못 채우면 이유와 함께 거절하고 기록하지 않아요', async () => {
		const t = setup();
		const { id } = await t.service.start(startInput({ conditions: [{ type: 'minJoinDays', days: 100 }] }));
		const result = await t.service.enter(id, GUILD, user(1), facts());
		expect(result).toMatchObject({ kind: 'ineligible' });
		expect(t.entries.get(id)?.size ?? 0).toBe(0);
	});

	it('끝났거나 다른 서버의 나눔이면 closed예요', async () => {
		const t = setup();
		const { id } = await t.service.start(startInput());
		expect(await t.service.enter(id, '999999999999999999', user(1), facts())).toEqual({ kind: 'closed' });
		t.advance(2 * 3_600_000);
		expect(await t.service.enter(id, GUILD, user(1), facts())).toEqual({ kind: 'closed' });
		expect(await t.service.enter('nope', GUILD, user(1), facts())).toEqual({ kind: 'closed' });
	});

	it('참여를 취소할 수 있어요', async () => {
		const t = setup();
		const { id } = await t.service.start(startInput());
		await t.service.enter(id, GUILD, user(1), facts());
		expect(await t.service.leave(id, GUILD, user(1))).toBe(true);
		expect(await t.service.leave(id, GUILD, user(1))).toBe(false);
	});

	it('마감 시각이 지나면 추첨 전이라도 참여를 취소할 수 없어요', async () => {
		const t = setup();
		const { id } = await t.service.start(startInput());
		await t.service.enter(id, GUILD, user(1), facts());
		t.advance(2 * 3_600_000);
		expect(await t.service.leave(id, GUILD, user(1))).toBe(false);
		expect(t.entries.get(id)?.size).toBe(1);
	});
});

describe('카드 갱신 스로틀', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('참여가 몰려도 10초에 한 번만 카드를 고쳐요', async () => {
		const t = setup();
		const { id } = await t.service.start(startInput());
		t.discord.updateCard.mockClear();
		// 첫 요청은 바로, 이후 요청은 10초 뒤 한 번으로 묶여요
		for (let i = 1; i <= 5; i++) await t.service.enter(id, GUILD, user(i), facts());
		await vi.advanceTimersByTimeAsync(0);
		expect(t.discord.updateCard).toHaveBeenCalledTimes(1);
		for (let i = 6; i <= 9; i++) await t.service.enter(id, GUILD, user(i), facts());
		await vi.advanceTimersByTimeAsync(0);
		expect(t.discord.updateCard).toHaveBeenCalledTimes(1);
		t.advance(10_000);
		await vi.advanceTimersByTimeAsync(10_000);
		expect(t.discord.updateCard).toHaveBeenCalledTimes(2);
		expect((t.discord.updateCard.mock.calls[1] as unknown[])[2]).toMatchObject({ entryCount: 9 });
		await t.service.stop();
	});
});

describe('마감과 추첨', () => {
	const enterAll = async (t: ReturnType<typeof setup>, id: string, count: number) => {
		for (let i = 1; i <= count; i++) {
			t.members.set(user(i), facts());
			await t.service.enter(id, GUILD, user(i), facts());
		}
	};

	it('마감 시점에 조건을 다시 확인해서 역할을 잃었거나 나간 참여자를 빼요', async () => {
		const t = setup();
		const { id } = await t.service.start(startInput({ winnerCount: 5, conditions: [{ type: 'requiredRoles', roleIds: [ROLE], match: 'any' }] }));
		await enterAll(t, id, 4);
		t.members.set(user(1), facts({ roleIds: [] })); // 역할을 잃음
		t.members.delete(user(2)); // 서버를 나감
		await t.runJob(id);
		const row = t.giveaways.get(id)!;
		expect(row.status).toBe('ended');
		expect([...row.winnerIds].sort()).toEqual([user(3), user(4)]);
		expect(row).toMatchObject({ entryCount: 4, eligibleCount: 2 });
		expect(t.discord.announce).toHaveBeenCalledOnce();
		expect(row.announcedAt).not.toBeNull();
	});

	it('당첨자 수보다 참여자가 적으면 전원이 당첨돼요', async () => {
		const t = setup();
		const { id } = await t.service.start(startInput({ winnerCount: 5 }));
		await enterAll(t, id, 2);
		await t.runJob(id);
		expect(t.giveaways.get(id)!.winnerIds).toHaveLength(2);
	});

	it('참여자가 없으면 당첨자 없이 발표해요', async () => {
		const t = setup();
		const { id } = await t.service.start(startInput());
		await t.runJob(id);
		expect(t.giveaways.get(id)).toMatchObject({ status: 'ended', winnerIds: [] });
		expect(t.discord.announce).toHaveBeenCalledOnce();
	});

	it('같은 작업이 다시 돌아도 한 번만 추첨·발표해요', async () => {
		const t = setup();
		const { id } = await t.service.start(startInput());
		await enterAll(t, id, 3);
		await t.runJob(id);
		await t.runJob(id);
		expect(t.discord.announce).toHaveBeenCalledOnce();
	});

	it('발표가 실패하면 던져서 재시도하고, 재시도에서는 다시 추첨하지 않고 발표만 해요', async () => {
		const t = setup();
		const { id } = await t.service.start(startInput({ winnerCount: 1 }));
		await enterAll(t, id, 3);
		t.discord.announce.mockRejectedValueOnce(new Error('503'));
		await expect(t.runJob(id)).rejects.toThrow('503');
		const winners = [...t.giveaways.get(id)!.winnerIds];
		expect(t.giveaways.get(id)!.announcedAt).toBeNull();
		await t.runJob(id);
		expect(t.giveaways.get(id)!.winnerIds).toEqual(winners);
		expect(t.giveaways.get(id)!.announcedAt).not.toBeNull();
		expect(t.discord.announce).toHaveBeenCalledTimes(2);
	});

	it('취소된 나눔은 마감 작업이 와도 아무것도 하지 않아요', async () => {
		const t = setup();
		const { id } = await t.service.start(startInput());
		expect(await t.service.cancel(GUILD, id)).toBe('cancelled');
		expect(t.jobs).toHaveLength(0);
		await t.runJob(id);
		expect(t.discord.announce).not.toHaveBeenCalled();
		expect(await t.service.cancel(GUILD, id)).toBe('not-running');
	});

	it('조건 JSON이 깨졌으면 안전하게 아무도 뽑지 않아요', async () => {
		const t = setup();
		const { id } = await t.service.start(startInput());
		await enterAll(t, id, 2);
		t.giveaways.get(id)!.requirements = { version: 99 };
		await t.runJob(id);
		expect(t.giveaways.get(id)!.winnerIds).toEqual([]);
	});

	it('/종료는 바로 추첨하고 다른 서버의 나눔은 찾지 못해요', async () => {
		const t = setup();
		const { id } = await t.service.start(startInput());
		await enterAll(t, id, 3);
		expect(await t.service.endNow('999999999999999999', id)).toBe('not-found');
		expect(await t.service.endNow(GUILD, id)).toBe('ended');
		expect(t.giveaways.get(id)!.status).toBe('ended');
		expect(await t.service.endNow(GUILD, id)).toBe('not-running');
	});

	it('다시 뽑기는 기존 당첨자를 빼고 조건을 다시 확인해요', async () => {
		let n = 0;
		const t = setup({ rng: () => n++ % 1 });
		const { id } = await t.service.start(startInput({ winnerCount: 1 }));
		await enterAll(t, id, 3);
		await t.runJob(id);
		const first = t.giveaways.get(id)!.winnerIds[0]!;
		const { winnerIds } = await t.service.reroll(GUILD, id, 1);
		expect(winnerIds).toHaveLength(1);
		expect(winnerIds[0]).not.toBe(first);
		expect(t.giveaways.get(id)!.winnerIds).toHaveLength(2);
		expect(t.discord.announce).toHaveBeenLastCalledWith(CHANNEL, 'msg-1', expect.anything(), 'reroll', winnerIds);
	});

	it('다시 뽑기는 끝난 나눔에서만, 뽑을 사람이 남아 있을 때만 돼요', async () => {
		const t = setup();
		const { id } = await t.service.start(startInput({ winnerCount: 5 }));
		await enterAll(t, id, 2);
		await expect(t.service.reroll(GUILD, id, 1)).rejects.toMatchObject({ kind: 'conflict' });
		await t.runJob(id);
		await expect(t.service.reroll(GUILD, id, 1)).rejects.toMatchObject({ kind: 'conflict' });
		await expect(t.service.reroll(GUILD, 'nope', 1)).rejects.toMatchObject({ kind: 'not_found' });
	});
});
