import { describe, expect, it, vi } from 'vitest';
import { createGuildLifecycleService, FRESH_JOIN_WINDOW_MS, isFreshJoin } from './guildLifecycle.ts';

const NOW = new Date('2026-11-21T00:00:00Z');
const uniqueViolation = Object.assign(new Error('unique'), { code: 'P2002' });

function setup({ exists, reopened }: { exists: boolean; reopened: number }) {
	const db = {
		guildLifecycle: {
			create: vi.fn(async () => {
				if (exists) throw uniqueViolation;
				return {};
			}),
			updateMany: vi.fn(async () => ({ count: reopened })),
			upsert: vi.fn(async () => ({}))
		}
	};
	return { db, service: createGuildLifecycleService({ db: db as never }) };
}

describe('isFreshJoin', () => {
	it('봇 가입 시각이 10분 안이면 새로 들어온 거예요', () => {
		expect(isFreshJoin(new Date(NOW.getTime() - 1000), NOW)).toBe(true);
		expect(isFreshJoin(new Date(NOW.getTime() - FRESH_JOIN_WINDOW_MS - 1), NOW)).toBe(false);
		expect(isFreshJoin(null, NOW)).toBe(true);
	});
});

describe('recordJoin', () => {
	it('행이 없으면 처음 들어온 거예요', async () => {
		const { service, db } = setup({ exists: false, reopened: 0 });
		await expect(service.recordJoin('g1', NOW, NOW)).resolves.toBe('first');
		expect(db.guildLifecycle.create).toHaveBeenCalledWith({ data: { guildId: 'g1', joinedAt: NOW, joinCount: 1 } });
	});

	it('오래전에 들어온 서버의 이벤트면 행만 만들고 안내하지 않아요', async () => {
		const { service } = setup({ exists: false, reopened: 0 });
		const old = new Date(NOW.getTime() - 24 * 60 * 60_000);
		await expect(service.recordJoin('g1', old, NOW)).resolves.toBe('skip');
	});

	it('나갔다가 다시 들어오면 rejoin이에요', async () => {
		const { service, db } = setup({ exists: true, reopened: 1 });
		await expect(service.recordJoin('g1', NOW, NOW)).resolves.toBe('rejoin');
		expect(db.guildLifecycle.updateMany).toHaveBeenCalledWith({
			where: { guildId: 'g1', leftAt: { not: null } },
			data: { joinedAt: NOW, leftAt: null, joinCount: { increment: 1 } }
		});
	});

	it('나간 기록 없이 같은 이벤트가 또 오면 안내하지 않아요', async () => {
		const { service } = setup({ exists: true, reopened: 0 });
		await expect(service.recordJoin('g1', NOW, NOW)).resolves.toBe('skip');
	});

	it('고유 키 충돌이 아닌 오류는 그대로 던져요', async () => {
		const { service, db } = setup({ exists: false, reopened: 0 });
		db.guildLifecycle.create.mockRejectedValueOnce(new Error('db down'));
		await expect(service.recordJoin('g1', NOW, NOW)).rejects.toThrow('db down');
	});
});

describe('recordLeave · markFirstUse', () => {
	it('나간 기록은 행이 없어도 만들어요', async () => {
		const { service, db } = setup({ exists: false, reopened: 0 });
		await service.recordLeave('g1', NOW);
		expect(db.guildLifecycle.upsert).toHaveBeenCalledWith({
			where: { guildId: 'g1' },
			create: { guildId: 'g1', joinedAt: NOW, leftAt: NOW, joinCount: 1 },
			update: { leftAt: NOW }
		});
	});

	it('첫 사용은 비어 있는 서버에만 기록해요', async () => {
		const { service, db } = setup({ exists: false, reopened: 0 });
		await service.markFirstUse([], NOW);
		expect(db.guildLifecycle.updateMany).not.toHaveBeenCalled();
		await service.markFirstUse(['g1', 'g2'], NOW);
		expect(db.guildLifecycle.updateMany).toHaveBeenCalledWith({
			where: { guildId: { in: ['g1', 'g2'] }, firstUseAt: null },
			data: { firstUseAt: NOW }
		});
	});
});
