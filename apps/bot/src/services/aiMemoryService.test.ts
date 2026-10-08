import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiMemoryService } from './aiMemoryService.ts';

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock('@sapphire/framework', () => ({ container: { db: { userMemory: { findUnique } } } }));

describe('AiMemoryService prompt reads', () => {
	beforeEach(() => {
		findUnique.mockReset();
	});

	it('loads long and short term memory from one database snapshot', async () => {
		findUnique.mockResolvedValue({
			longTerm: '# MEMORY.md\n\n## Facts\n- 부산 거주\n\n## Preferences\n\n## Commitments',
			shortTerm: [{ q: '안녕', a: '반가워요', at: 0, channelId: 'channel' }]
		});
		const prompt = await new AiMemoryService().buildPromptBlock('user');
		expect(findUnique).toHaveBeenCalledTimes(1);
		expect(findUnique).toHaveBeenCalledWith({ where: { userId: 'user' }, select: { longTerm: true, shortTerm: true } });
		expect(prompt).toContain('부산 거주');
		expect(prompt).toContain('사용자: 안녕');
		expect(prompt).toContain('시루: 반가워요');
	});

	it.each([[{ text: '재즈 선호', at: 0 }], JSON.stringify([{ text: '재즈 선호', at: 0 }])])(
		'keeps compatibility with legacy stored memory: %j',
		async (longTerm) => {
			findUnique.mockResolvedValue({ longTerm, shortTerm: [] });
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
