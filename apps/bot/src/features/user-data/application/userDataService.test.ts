import { describe, expect, it, vi } from 'vitest';
import { Prisma, type PrismaClient } from '@sirubot/prisma';
import { purgeUserData, summarizeUserData } from './userDataService.ts';

function makeMockDb(overrides: {
	memory?: { userId?: string; longTerm?: unknown; shortTerm?: unknown; shortTermSummary?: string | null } | null;
	profile?: { birthMonth: number | null; birthDay: number | null; intro: string | null } | null;
	ttsCount?: number;
	gameCount?: number;
}) {
	const userMemoryUpdate = vi.fn().mockResolvedValue({});
	const userUpdateMany = vi.fn().mockResolvedValue({ count: overrides.profile ? 1 : 0 });
	const ttsDeleteMany = vi.fn().mockResolvedValue({ count: overrides.ttsCount ?? 0 });
	const gameDeleteMany = vi.fn().mockResolvedValue({ count: overrides.gameCount ?? 0 });

	const db = {
		userMemory: {
			findUnique: vi.fn().mockResolvedValue(overrides.memory ?? null),
			update: userMemoryUpdate
		},
		user: {
			findUnique: vi.fn().mockResolvedValue(overrides.profile ?? null),
			updateMany: userUpdateMany
		},
		ttsUserSetting: {
			count: vi.fn().mockResolvedValue(overrides.ttsCount ?? 0),
			deleteMany: ttsDeleteMany
		},
		gameRecord: {
			count: vi.fn().mockResolvedValue(overrides.gameCount ?? 0),
			deleteMany: gameDeleteMany
		}
	} as unknown as PrismaClient;

	return { db, userMemoryUpdate, userUpdateMany, ttsDeleteMany, gameDeleteMany };
}

describe('userDataService', () => {
	it('summarizeUserData는 단기 기억 롤링 요약 유무까지 포함해 집계해요', async () => {
		const { db } = makeMockDb({
			memory: {
				longTerm: '# MEMORY.md\n\n## Facts\n- 고양이를 키워요\n',
				shortTerm: [{ q: '안녕', a: '안녕하세요' }],
				shortTermSummary: '이전 대화 요약'
			},
			profile: { birthMonth: 5, birthDay: 10, intro: '반가워요' },
			ttsCount: 2,
			gameCount: 7
		});

		const summary = await summarizeUserData(db, 'user-1');
		expect(summary).toEqual({
			memoryFacts: 1,
			shortTermTurns: 1,
			hasShortTermSummary: true,
			hasBirthday: true,
			hasIntro: true,
			ttsSettings: 2,
			gameRecords: 7
		});
	});

	it('purgeUserData는 장기·단기 기억과 함께 shortTermSummary도 null로 지워요', async () => {
		const { db, userMemoryUpdate } = makeMockDb({
			memory: {
				userId: 'user-1',
				shortTerm: [],
				shortTermSummary: '남아 있으면 안 되는 요약'
			},
			profile: { birthMonth: 1, birthDay: 1, intro: 'hi' },
			ttsCount: 1,
			gameCount: 3
		});

		const result = await purgeUserData(db, 'user-1');
		expect(userMemoryUpdate).toHaveBeenCalledWith({
			where: { userId: 'user-1' },
			data: { longTerm: Prisma.DbNull, shortTerm: [], shortTermSummary: null }
		});
		expect(result).toEqual({
			memoryRows: 1,
			shortTermCleared: true,
			profileRows: 1,
			ttsRows: 1,
			gameRecords: 3
		});
	});
});
