import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_BIRTHDAY_CARD } from '@sirubot/utils/birthdayCelebration';
import type { GreetingConfig } from '@sirubot/utils/memberGreeting';
import { BirthdayService, type BirthdayDiscordPort, type BirthdayMember } from './birthdayService.ts';

const GUILD = '100000000000000001';
const CHANNEL = '200000000000000001';
const ROLE = '300000000000000001';
const user = (n: number) => `4000000000000000${String(n).padStart(2, '0')}`;
const kst = (text: string) => new Date(`${text.replace(' ', 'T')}:00+09:00`);

interface Settings {
	guildId: string;
	config: GreetingConfig;
	sendTime: string;
	roleId: string | null;
	activeFrom: string | null;
	lastCelebratedOn: string | null;
}
interface Job {
	id: string;
	guildId: string;
	kind: string;
	status: string;
	runAt: Date;
}

const enabledCard: GreetingConfig = { ...DEFAULT_BIRTHDAY_CARD, enabled: true, channelId: CHANNEL };

function setup(options: { now: string; settings?: Partial<Settings> | null; birthdays?: Record<string, [number, number]>; optIns?: string[] }) {
	let clock = kst(options.now);
	const settings = new Map<string, Settings>();
	if (options.settings !== null) {
		settings.set(GUILD, {
			guildId: GUILD,
			config: enabledCard,
			sendTime: '09:00',
			roleId: null,
			activeFrom: null,
			lastCelebratedOn: null,
			...options.settings
		});
	}
	const users = new Map<string, { birthMonth: number | null; birthDay: number | null }>();
	for (const [id, [m, d]] of Object.entries(options.birthdays ?? {})) users.set(id, { birthMonth: m, birthDay: d });
	const optIns = new Map<string, number>();
	(options.optIns ?? []).forEach((id, i) => optIns.set(id, i));
	const jobs: Job[] = [];
	const grants = new Map<string, { roleId: string; grantedOn: string }>();
	let seq = 0;

	const db = {
		$transaction: async (fn: (tx: unknown) => unknown) => fn(db),
		$executeRaw: async () => 0,
		guild: { upsert: vi.fn(async () => ({})) },
		user: {
			upsert: vi.fn(async ({ where }: { where: { id: string } }) => {
				if (!users.has(where.id)) users.set(where.id, { birthMonth: null, birthDay: null });
				return {};
			})
		},
		scheduledJob: {
			count: async ({ where }: { where: { status: { in: string[] }; id?: { not: string } } }) =>
				jobs.filter((j) => where.status.in.includes(j.status) && (!where.id || j.id !== where.id.not)).length,
			create: async ({ data }: { data: Omit<Job, 'id' | 'status'> }) => void jobs.push({ id: `j${++seq}`, status: 'pending', ...data }),
			deleteMany: async () => ({ count: 0 })
		},
		birthdaySettings: {
			findUnique: async () => settings.get(GUILD) ?? null,
			findMany: async () => [...settings.values()],
			update: async ({ data }: { data: Partial<Settings> }) => Object.assign(settings.get(GUILD)!, data)
		},
		birthdayOptIn: {
			findUnique: async ({ where }: { where: { guildId_userId: { userId: string } } }) =>
				optIns.has(where.guildId_userId.userId) ? { userId: where.guildId_userId.userId } : null,
			upsert: async ({ create }: { create: { userId: string } }) => void optIns.set(create.userId, optIns.size),
			deleteMany: async ({ where }: { where: { userId: string } }) => ({ count: optIns.delete(where.userId) ? 1 : 0 }),
			findMany: async ({ where }: { where: { user: { OR: { birthMonth: number; birthDay: number }[] } } }) =>
				[...optIns.entries()]
					.filter(([id]) => {
						const u = users.get(id);
						return u && where.user.OR.some((c) => c.birthMonth === u.birthMonth && c.birthDay === u.birthDay);
					})
					.sort((a, b) => a[1] - b[1])
					.map(([userId]) => ({ userId }))
		},
		birthdayRoleGrant: {
			findMany: async ({ where }: { where: { grantedOn: { lt: string } } }) =>
				[...grants.entries()].filter(([, g]) => g.grantedOn < where.grantedOn.lt).map(([userId, g]) => ({ userId, ...g })),
			upsert: async ({ create }: { create: { userId: string; roleId: string; grantedOn: string } }) =>
				void grants.set(create.userId, { roleId: create.roleId, grantedOn: create.grantedOn }),
			deleteMany: async ({ where }: { where: { userId: string; grantedOn: string } }) =>
				grants.get(where.userId)?.grantedOn === where.grantedOn ? { count: grants.delete(where.userId) ? 1 : 0 } : { count: 0 }
		}
	};

	const present = new Set<string>(optIns.keys());
	const discord = {
		fetchMembers: vi.fn(async (_guildId: string, ids: readonly string[]) => {
			const map = new Map<string, BirthdayMember>();
			for (const id of ids) if (present.has(id)) map.set(id, { id, displayName: `이름${id.slice(-2)}`, mention: `<@${id}>`, avatarUrl: null });
			return map;
		}),
		celebrate: vi.fn(async () => undefined),
		addRole: vi.fn(async () => true),
		removeRole: vi.fn(async () => true)
	} satisfies BirthdayDiscordPort;

	let handler: ((job: unknown) => Promise<void>) | undefined;
	const service = new BirthdayService({
		db: db as never,
		scheduler: { register: (_kind, h) => void (handler = h as never) },
		discord,
		isFeatureEnabled: vi.fn(async () => true),
		recordUsage: vi.fn(),
		logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
		now: () => clock
	});

	return {
		service,
		discord,
		settings,
		jobs,
		grants,
		present,
		optIns,
		setNow: (text: string) => void (clock = kst(text)),
		run: (runAt: string) => handler!({ id: 'running-job', guildId: GUILD, kind: 'birthday_daily', runAt: kst(runAt), payload: {} })
	};
}

const celebrated = (t: ReturnType<typeof setup>) =>
	(t.discord.celebrate.mock.calls as unknown as [string, GreetingConfig, BirthdayMember[]][]).map((c) => c[2].map((m) => m.id));

describe('BirthdayService.handle', () => {
	it('오늘 생일이고 동의한 멤버만 축하하고, 같은 날 두 번 보내지 않아요', async () => {
		const t = setup({
			now: '2026-11-22 09:00',
			birthdays: { [user(1)]: [11, 22], [user(2)]: [11, 23], [user(3)]: [11, 22] },
			optIns: [user(1), user(2)]
		});
		await t.run('2026-11-22 09:00');
		expect(celebrated(t)).toEqual([[user(1)]]);
		expect(t.settings.get(GUILD)!.lastCelebratedOn).toBe('2026-11-22');
		await t.run('2026-11-22 09:00');
		expect(t.discord.celebrate).toHaveBeenCalledTimes(1);
	});

	it('같은 날 생일이 여럿이면 메시지 한 번에 모아요', async () => {
		const t = setup({
			now: '2026-11-22 09:00',
			birthdays: { [user(1)]: [11, 22], [user(2)]: [11, 22], [user(3)]: [11, 22] },
			optIns: [user(1), user(2), user(3)]
		});
		await t.run('2026-11-22 09:00');
		expect(t.discord.celebrate).toHaveBeenCalledTimes(1);
		expect(celebrated(t)).toEqual([[user(1), user(2), user(3)]]);
	});

	it('서버를 나간 멤버는 건너뛰고, 모두 나갔으면 보내지 않아요', async () => {
		const t = setup({ now: '2026-11-22 09:00', birthdays: { [user(1)]: [11, 22], [user(2)]: [11, 22] }, optIns: [user(1), user(2)] });
		t.present.delete(user(1));
		await t.run('2026-11-22 09:00');
		expect(celebrated(t)).toEqual([[user(2)]]);

		const none = setup({ now: '2026-11-22 09:00', birthdays: { [user(1)]: [11, 22] }, optIns: [user(1)] });
		none.present.clear();
		await none.run('2026-11-22 09:00');
		expect(none.discord.celebrate).not.toHaveBeenCalled();
	});

	it('2월 29일생은 평년의 2월 28일에 축하하고, 윤년 2월 28일에는 하지 않아요', async () => {
		const common = { birthdays: { [user(1)]: [2, 29] as [number, number], [user(2)]: [2, 28] as [number, number] }, optIns: [user(1), user(2)] };
		const nonLeap = setup({ now: '2027-02-28 09:00', ...common });
		await nonLeap.run('2027-02-28 09:00');
		expect(celebrated(nonLeap)).toEqual([[user(1), user(2)]]);

		const leap28 = setup({ now: '2028-02-28 09:00', ...common });
		await leap28.run('2028-02-28 09:00');
		expect(celebrated(leap28)).toEqual([[user(2)]]);

		const leap29 = setup({ now: '2028-02-29 09:00', ...common });
		await leap29.run('2028-02-29 09:00');
		expect(celebrated(leap29)).toEqual([[user(1)]]);

		const nonLeapMar1 = setup({ now: '2027-03-01 09:00', ...common });
		await nonLeapMar1.run('2027-03-01 09:00');
		expect(nonLeapMar1.discord.celebrate).not.toHaveBeenCalled();
	});

	it('KST 자정 직후(UTC로는 전날)에도 KST 날짜로 생일을 가려요', async () => {
		const t = setup({ now: '2026-11-22 00:30', settings: { sendTime: '00:30' }, birthdays: { [user(1)]: [11, 22] }, optIns: [user(1)] });
		await t.run('2026-11-22 00:30');
		expect(celebrated(t)).toEqual([[user(1)]]);
	});

	it('새로 켠 당일에는 보내지 않고 다음 날부터 보내요', async () => {
		const t = setup({
			now: '2026-11-22 09:00',
			settings: { activeFrom: '2026-11-23' },
			birthdays: { [user(1)]: [11, 22], [user(2)]: [11, 23] },
			optIns: [user(1), user(2)]
		});
		await t.run('2026-11-22 09:00');
		expect(t.discord.celebrate).not.toHaveBeenCalled();
		expect(t.jobs).toHaveLength(1);
		t.setNow('2026-11-23 09:00');
		await t.run('2026-11-23 09:00');
		expect(celebrated(t)).toEqual([[user(2)]]);
	});

	it('다음 회차를 먼저 하루 뒤 같은 시각으로 예약해서, 보내기가 실패해도 고리가 끊기지 않아요', async () => {
		const t = setup({ now: '2026-11-22 09:00', birthdays: { [user(1)]: [11, 22] }, optIns: [user(1)] });
		t.discord.celebrate.mockRejectedValueOnce(new Error('권한 없음'));
		await expect(t.run('2026-11-22 09:00')).rejects.toThrow('권한 없음');
		expect(t.jobs).toHaveLength(1);
		expect(t.jobs[0]!.runAt).toEqual(kst('2026-11-23 09:00'));
		expect(t.settings.get(GUILD)!.lastCelebratedOn).toBeNull();
		await t.run('2026-11-22 09:00');
		expect(t.jobs).toHaveLength(1);
		expect(t.settings.get(GUILD)!.lastCelebratedOn).toBe('2026-11-22');
	});

	it('꺼져 있으면 다음 회차를 만들지 않아 고리가 끝나요', async () => {
		const t = setup({
			now: '2026-11-22 09:00',
			settings: { config: { ...enabledCard, enabled: false } },
			birthdays: { [user(1)]: [11, 22] },
			optIns: [user(1)]
		});
		await t.run('2026-11-22 09:00');
		expect(t.jobs).toHaveLength(0);
		expect(t.discord.celebrate).not.toHaveBeenCalled();
		const gone = setup({ now: '2026-11-22 09:00', settings: null });
		await gone.run('2026-11-22 09:00');
		expect(gone.jobs).toHaveLength(0);
	});

	it('봇이 오래 꺼져 다른 날에 돌았으면 그날 축하는 건너뛰고 다음 회차는 앞으로 예약해요', async () => {
		const t = setup({ now: '2026-11-25 10:00', birthdays: { [user(1)]: [11, 22], [user(2)]: [11, 25] }, optIns: [user(1), user(2)] });
		await t.run('2026-11-22 09:00');
		expect(t.discord.celebrate).not.toHaveBeenCalled();
		expect(t.jobs[0]!.runAt).toEqual(kst('2026-11-26 09:00'));
	});

	it('커뮤니티 모듈이 꺼진 서버에서는 보내지 않아요', async () => {
		const t = setup({ now: '2026-11-22 09:00', birthdays: { [user(1)]: [11, 22] }, optIns: [user(1)] });
		(t.service as unknown as { deps: { isFeatureEnabled: () => Promise<boolean> } }).deps.isFeatureEnabled = async () => false;
		await t.run('2026-11-22 09:00');
		expect(t.discord.celebrate).not.toHaveBeenCalled();
		expect(t.jobs).toHaveLength(1);
	});

	it('채널이 없으면 메시지 없이 역할만 주고 기록해요', async () => {
		const t = setup({
			now: '2026-11-22 09:00',
			settings: { config: { ...enabledCard, channelId: null }, roleId: ROLE },
			birthdays: { [user(1)]: [11, 22] },
			optIns: [user(1)]
		});
		await t.run('2026-11-22 09:00');
		expect(t.discord.celebrate).not.toHaveBeenCalled();
		expect(t.discord.addRole).toHaveBeenCalledWith(GUILD, user(1), ROLE);
	});
});

describe('생일 역할', () => {
	it('당일에 주고 기록하며, 다음 날 회차에서 거두고 기록을 지워요', async () => {
		const t = setup({ now: '2026-11-22 09:00', settings: { roleId: ROLE }, birthdays: { [user(1)]: [11, 22] }, optIns: [user(1)] });
		await t.run('2026-11-22 09:00');
		expect(t.discord.addRole).toHaveBeenCalledWith(GUILD, user(1), ROLE);
		expect(t.grants.get(user(1))).toEqual({ roleId: ROLE, grantedOn: '2026-11-22' });
		expect(t.discord.removeRole).not.toHaveBeenCalled();

		t.setNow('2026-11-23 09:00');
		await t.run('2026-11-23 09:00');
		expect(t.discord.removeRole).toHaveBeenCalledWith(GUILD, user(1), ROLE);
		expect(t.grants.size).toBe(0);
	});

	it('거두기가 일시 오류로 실패하면 기록을 남겨 다음 회차가 다시 해요', async () => {
		const t = setup({ now: '2026-11-23 09:00', settings: { roleId: ROLE }, birthdays: {}, optIns: [] });
		t.grants.set(user(1), { roleId: ROLE, grantedOn: '2026-11-22' });
		t.discord.removeRole.mockResolvedValueOnce(false);
		await t.run('2026-11-23 09:00');
		expect(t.grants.size).toBe(1);
		t.setNow('2026-11-24 09:00');
		await t.run('2026-11-24 09:00');
		expect(t.grants.size).toBe(0);
	});

	it('서버 설정이 꺼진 뒤에도 남은 역할은 거둬요', async () => {
		const t = setup({ now: '2026-11-23 09:00', settings: { config: { ...enabledCard, enabled: false }, roleId: ROLE } });
		t.grants.set(user(1), { roleId: ROLE, grantedOn: '2026-11-22' });
		await t.run('2026-11-23 09:00');
		expect(t.discord.removeRole).toHaveBeenCalledTimes(1);
		expect(t.grants.size).toBe(0);
	});

	it('역할을 못 줘도(권한 부족) 축하 메시지는 보내요', async () => {
		const t = setup({ now: '2026-11-22 09:00', settings: { roleId: ROLE }, birthdays: { [user(1)]: [11, 22] }, optIns: [user(1)] });
		t.discord.addRole.mockResolvedValue(false);
		await t.run('2026-11-22 09:00');
		expect(t.grants.size).toBe(0);
		expect(t.discord.celebrate).toHaveBeenCalledTimes(1);
	});
});

describe('동의와 작업 복구', () => {
	it('서버별로 켜고 끄며 서버·사용자 행을 먼저 만들어요', async () => {
		const t = setup({ now: '2026-11-22 09:00' });
		await t.service.setOptIn(GUILD, user(5), true);
		expect(await t.service.isOptedIn(GUILD, user(5))).toBe(true);
		await t.service.setOptIn(GUILD, user(5), false);
		expect(await t.service.isOptedIn(GUILD, user(5))).toBe(false);
	});

	it('reconcile은 켜져 있는데 작업이 없는 서버에만 다음 보내는 시각으로 만들어요', async () => {
		const t = setup({ now: '2026-11-22 10:00' });
		expect(await t.service.reconcile([GUILD])).toBe(1);
		expect(t.jobs[0]!.runAt).toEqual(kst('2026-11-23 09:00'));
		expect(await t.service.reconcile([GUILD])).toBe(0);

		const off = setup({ now: '2026-11-22 10:00', settings: { config: { ...enabledCard, enabled: false } } });
		expect(await off.service.reconcile([GUILD])).toBe(0);
	});
});
