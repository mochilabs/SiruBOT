import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PROMOTION_MIN_TURNS, scheduleMemoryPromotion } from './memoryPromotion.ts';

const mocks = vi.hoisted(() => ({
	getShortTermTurns: vi.fn(),
	getShortTermSummary: vi.fn(),
	readFile: vi.fn(),
	mergeLongTerm: vi.fn(),
	compactShortTerm: vi.fn(),
	clearShortTerm: vi.fn(),
	streamChatCompletion: vi.fn()
}));

vi.mock('@sapphire/framework', () => ({
	container: {
		aiMemoryService: {
			getShortTermTurns: mocks.getShortTermTurns,
			getShortTermSummary: mocks.getShortTermSummary,
			readFile: mocks.readFile,
			mergeLongTerm: mocks.mergeLongTerm,
			compactShortTerm: mocks.compactShortTerm,
			clearShortTerm: mocks.clearShortTerm
		},
		logger: { warn: vi.fn(), info: vi.fn() }
	}
}));

vi.mock('./completion.ts', () => ({ streamChatCompletion: mocks.streamChatCompletion }));

const config = { apiUrl: 'http://x/v1', apiKey: '', model: 'test', timeoutMs: 1000, streamUpdateMs: 450, thinkToken: false };

function flushPromises() {
	return new Promise((resolve) => setImmediate(resolve));
}

function turns(count: number) {
	return new Array(count).fill(null).map(() => ({ q: '부산에 살아요', a: '그렇군요', at: 0, channelId: 'c' }));
}

describe('scheduleMemoryPromotion', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getShortTermTurns.mockResolvedValue([]);
		mocks.getShortTermSummary.mockResolvedValue(null);
		mocks.readFile.mockResolvedValue('# MEMORY.md\n\n## Facts\n\n## Preferences\n\n## Commitments');
		mocks.mergeLongTerm.mockResolvedValue(2);
		mocks.compactShortTerm.mockResolvedValue(undefined);
		mocks.clearShortTerm.mockResolvedValue(undefined);
		mocks.streamChatCompletion.mockResolvedValue({ content: '{"summary":"","entries":[]}', toolCalls: [] });
	});

	it('단기 기억이 최소 턴 미만이면 압축·승격하지 않는다 (LLM 미호출)', async () => {
		mocks.getShortTermTurns.mockResolvedValue(turns(PROMOTION_MIN_TURNS - 1));

		scheduleMemoryPromotion('user-1', config);
		await flushPromises();
		await flushPromises();

		expect(mocks.streamChatCompletion).not.toHaveBeenCalled();
	});

	it('단기 기억이 충분하면 압축 요약을 저장하고 새 항목을 병합한다', async () => {
		mocks.getShortTermTurns.mockResolvedValue(turns(PROMOTION_MIN_TURNS));
		mocks.streamChatCompletion.mockResolvedValue({
			content: JSON.stringify({
				summary: '사용자는 부산에 살고 재즈를 좋아해요.',
				entries: [
					{ category: 'facts', text: '부산 거주' },
					{ category: 'preferences', text: '재즈 선호' }
				]
			}),
			toolCalls: []
		});

		scheduleMemoryPromotion('user-1', config);
		await flushPromises();
		await flushPromises();

		expect(mocks.streamChatCompletion).toHaveBeenCalledTimes(1);
		expect(mocks.mergeLongTerm).toHaveBeenCalledWith('user-1', [
			{ category: 'facts', text: '부산 거주' },
			{ category: 'preferences', text: '재즈 선호' }
		]);
		expect(mocks.compactShortTerm).toHaveBeenCalledWith('user-1', '사용자는 부산에 살고 재즈를 좋아해요.');
	});

	it('entries가 비어도 압축 요약은 저장한다', async () => {
		mocks.getShortTermTurns.mockResolvedValue(turns(PROMOTION_MIN_TURNS));
		mocks.streamChatCompletion.mockResolvedValue({
			content: JSON.stringify({ summary: '음악 대화가 이어졌어요.', entries: [] }),
			toolCalls: []
		});

		scheduleMemoryPromotion('user-1', config);
		await flushPromises();
		await flushPromises();

		expect(mocks.mergeLongTerm).not.toHaveBeenCalled();
		expect(mocks.compactShortTerm).toHaveBeenCalledWith('user-1', '음악 대화가 이어졌어요.');
	});

	it('모델 출력이 올바른 JSON이 아니면 안전하게 빈 요약·빈 entries로 처리한다', async () => {
		mocks.getShortTermTurns.mockResolvedValue(turns(PROMOTION_MIN_TURNS));
		mocks.streamChatCompletion.mockResolvedValue({ content: '그냥 텍스트 응답', toolCalls: [] });

		scheduleMemoryPromotion('user-1', config);
		await flushPromises();
		await flushPromises();

		expect(mocks.mergeLongTerm).not.toHaveBeenCalled();
		expect(mocks.clearShortTerm).toHaveBeenCalledWith('user-1');
	});

	it('잘못된 카테고리/빈 텍스트 항목은 걸러진다', async () => {
		mocks.getShortTermTurns.mockResolvedValue(turns(PROMOTION_MIN_TURNS));
		mocks.streamChatCompletion.mockResolvedValue({
			content: JSON.stringify({
				summary: '요약',
				entries: [
					{ category: 'facts', text: '  유효 항목  ' },
					{ category: 'nonsense', text: '잘못된 카테고리' },
					{ category: 'preferences', text: '' },
					{ text: '카테고리 없음' }
				]
			}),
			toolCalls: []
		});

		scheduleMemoryPromotion('user-1', config);
		await flushPromises();
		await flushPromises();

		expect(mocks.mergeLongTerm).toHaveBeenCalledWith('user-1', [{ category: 'facts', text: '유효 항목' }]);
	});

	it('같은 사용자의 동시 압축·승격은 한 번만 돈다', async () => {
		mocks.getShortTermTurns.mockResolvedValue(turns(PROMOTION_MIN_TURNS));
		let resolveCompletion!: (value: unknown) => void;
		mocks.streamChatCompletion.mockReturnValue(new Promise((resolve) => (resolveCompletion = resolve)));

		scheduleMemoryPromotion('user-1', config);
		await flushPromises();
		scheduleMemoryPromotion('user-1', config);
		await flushPromises();

		expect(mocks.streamChatCompletion).toHaveBeenCalledTimes(1);

		resolveCompletion({ content: '{"summary":"","entries":[]}', toolCalls: [] });
		await flushPromises();
		await flushPromises();
	});
});
