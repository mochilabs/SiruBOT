import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiMemoryService } from './aiMemoryService.ts';

const { findUnique, upsert } = vi.hoisted(() => ({ findUnique: vi.fn(), upsert: vi.fn() }));
vi.mock('@sapphire/framework', () => ({ container: { db: { userMemory: { findUnique, upsert } } } }));

describe('AiMemoryService prompt reads', () => {
	beforeEach(() => {
		findUnique.mockReset();
		upsert.mockReset();
	});

	it('loads long and short term memory from one database snapshot', async () => {
		findUnique.mockResolvedValue({
			longTerm: '# MEMORY.md\n\n## Facts\n- 부산 거주\n\n## Preferences\n\n## Commitments',
			shortTerm: [{ q: '안녕', a: '반가워요', at: 0, channelId: 'channel' }]
		});
		const prompt = await new AiMemoryService().buildPromptBlock('user');
		expect(findUnique).toHaveBeenCalledTimes(1);
		expect(findUnique).toHaveBeenCalledWith({
			where: { userId: 'user' },
			select: { longTerm: true, shortTerm: true, shortTermSummary: true }
		});
		expect(prompt).toContain('부산 거주');
		expect(prompt).toContain('사용자: 안녕');
		expect(prompt).toContain('시루: 반가워요');
	});

	it('압축 요약이 있으면 프롬프트 블록에 포함한다', async () => {
		findUnique.mockResolvedValue({
			longTerm: '# MEMORY.md\n\n## Facts\n- 부산 거주\n\n## Preferences\n\n## Commitments',
			shortTerm: [],
			shortTermSummary: '사용자는 부산에 살고 재즈를 좋아해요.'
		});
		const prompt = await new AiMemoryService().buildPromptBlock('user');
		expect(prompt).toContain('## 최근 대화 요약 (압축)');
		expect(prompt).toContain('사용자는 부산에 살고 재즈를 좋아해요.');
	});

	it.each([[{ text: '재즈 선호', at: 0 }], JSON.stringify([{ text: '재즈 선호', at: 0 }])])(
		'keeps compatibility with legacy stored memory: %j',
		async (longTerm) => {
			findUnique.mockResolvedValue({ longTerm, shortTerm: [], shortTermSummary: null });
			const prompt = await new AiMemoryService().buildPromptBlock('user');
			expect(findUnique).toHaveBeenCalledTimes(1);
			expect(prompt).toContain('# MEMORY.md');
			expect(prompt).toContain('재즈 선호');
		}
	);

	it('returns no prompt block when there is no stored memory', async () => {
		findUnique.mockResolvedValue(null);
		expect(await new AiMemoryService().buildPromptBlock('user')).toBeNull();
		expect(findUnique).toHaveBeenCalledTimes(1);
	});
});

describe('AiMemoryService short-term → long-term promotion helpers', () => {
	beforeEach(() => {
		findUnique.mockReset();
		upsert.mockReset();
	});

	it('getShortTermTurns은 저장된 단기 기억 턴만 돌려준다', async () => {
		findUnique.mockResolvedValue({
			shortTerm: [
				{ q: '안녕', a: '반가워요', at: 0, channelId: 'c' },
				{ q: '부산 살아', a: '부산이구나', at: 1, channelId: 'c' },
				null,
				{ q: '취미는?', a: '재즈 들어요', at: 2, channelId: 'c' }
			]
		});
		const turns = await new AiMemoryService().getShortTermTurns('user');
		expect(turns).toHaveLength(3);
		expect(turns[0]).toMatchObject({ q: '안녕' });
	});

	it('getShortTermSummary는 압축 요약을 돌려준다 (없으면 null)', async () => {
		findUnique.mockResolvedValue({ shortTermSummary: '  요약본  ' });
		expect(await new AiMemoryService().getShortTermSummary('user')).toBe('요약본');

		findUnique.mockResolvedValue({ shortTermSummary: null });
		expect(await new AiMemoryService().getShortTermSummary('user')).toBeNull();
	});

	it('mergeLongTerm은 새 항목만 추가하고 중복은 무시한다', async () => {
		findUnique
			.mockResolvedValueOnce({
				longTerm: '# MEMORY.md\n\n## Facts\n- 부산 거주\n\n## Preferences\n\n## Commitments'
			})
			.mockResolvedValueOnce({ longTerm: '# MEMORY.md\n\n## Facts\n- 부산 거주\n- 서울에서 일함\n\n## Preferences\n\n## Commitments' });

		const svc = new AiMemoryService();
		const added = await svc.mergeLongTerm('user', [
			{ category: 'facts', text: '부산 거주' }, // 중복
			{ category: 'facts', text: '서울에서 일함' }, // 신규
			{ category: 'nonsense' as never, text: '잘못된 카테고리' } // 무시
		]);

		expect(added).toBe(1);
		expect(upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { userId: 'user' },
				update: expect.objectContaining({ longTerm: expect.stringContaining('서울에서 일함') })
			})
		);
	});

	it('mergeLongTerm은 중복만 있으면 저장하지 않는다', async () => {
		findUnique.mockResolvedValueOnce({
			longTerm: '# MEMORY.md\n\n## Facts\n- 부산 거주\n\n## Preferences\n\n## Commitments'
		});

		const svc = new AiMemoryService();
		const added = await svc.mergeLongTerm('user', [{ category: 'facts', text: '부산 거주' }]);

		expect(added).toBe(0);
		expect(upsert).not.toHaveBeenCalled();
	});

	it('compactShortTerm은 원본 턴을 비우고 압축 요약을 저장한다', async () => {
		await new AiMemoryService().compactShortTerm('user', '  압축 요약  ');
		expect(upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { userId: 'user' },
				update: { shortTerm: [], shortTermSummary: '압축 요약' }
			})
		);
	});

	it('clearShortTerm은 단기 기억만 빈 배열로 비운다', async () => {
		await new AiMemoryService().clearShortTerm('user');
		expect(upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { userId: 'user' },
				update: { shortTerm: [] }
			})
		);
	});
});
