import { describe, expect, it, vi } from 'vitest';
import { PROMOTION_MIN_TURNS, MemoryPromotionJobs, scheduleMemoryPromotion } from './memoryPromotion.ts';

const mocks = vi.hoisted(() => ({ streamChatCompletion: vi.fn() }));
vi.mock('./completion.ts', () => ({ streamChatCompletion: mocks.streamChatCompletion }));

const memory = {
	getShortTermTurns: vi.fn(async () => new Array(PROMOTION_MIN_TURNS).fill({ q: '부산에 살아요', a: '그렇군요', at: 0, channelId: 'c' })),
	getShortTermSummary: vi.fn(async () => null),
	readFile: vi.fn(async () => ''),
	mergeLongTerm: vi.fn(async () => 0),
	compactShortTerm: vi.fn(async () => undefined),
	clearShortTerm: vi.fn(async () => undefined)
};
const promotions = new MemoryPromotionJobs();
const deps = { memory: memory as never, promotions, logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() } };
const config = { apiUrl: 'http://x/v1', apiKey: '', model: 'test', timeoutMs: 1000, streamUpdateMs: 450, thinkToken: false };

describe('memoryPromotionJobs.stop', () => {
	it('진행 중인 압축·승격이 끝난 뒤에 풀리고, 그 뒤로는 새 작업을 받지 않는다', async () => {
		let finishCompletion!: (value: { content: string; toolCalls: never[] }) => void;
		mocks.streamChatCompletion.mockReturnValue(new Promise((resolve) => (finishCompletion = resolve)));

		scheduleMemoryPromotion(deps, 'user-1', config);
		let stopResolved = false;
		const stopping = promotions.stop().then(() => (stopResolved = true));
		await new Promise((resolve) => setImmediate(resolve));
		expect(stopResolved).toBe(false);
		expect(memory.compactShortTerm).not.toHaveBeenCalled();

		finishCompletion({ content: '{"summary":"부산 거주","entries":[]}', toolCalls: [] });
		await stopping;
		expect(memory.compactShortTerm).toHaveBeenCalledExactlyOnceWith('user-1', '부산 거주');

		scheduleMemoryPromotion(deps, 'user-2', config);
		await new Promise((resolve) => setImmediate(resolve));
		expect(memory.getShortTermTurns).toHaveBeenCalledTimes(1);
	});
});
