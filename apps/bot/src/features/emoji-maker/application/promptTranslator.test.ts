import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanTranslation, createPromptTranslator } from './promptTranslator.ts';

const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal('fetch', fetchMock);
beforeEach(() => fetchMock.mockReset());

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
const llm = { apiUrl: 'http://llm.invalid/v1', apiKey: 'sk', model: 'm' };
const answer = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const translator = (on = true) => createPromptTranslator({ logger, getLlmConfig: () => (on ? llm : null) });

describe('cleanTranslation', () => {
	it('drops think blocks, quotes, trailing dots and extra lines', () => {
		expect(cleanTranslation('<think>hmm</think>\n"Cat wearing sunglasses."\nmore')).toBe('Cat wearing sunglasses');
		expect(cleanTranslation('  ')).toBe('');
	});
});

describe('createPromptTranslator', () => {
	it('passes English through without calling the LLM', async () => {
		expect(await translator().toEnglish('cat wearing sunglasses')).toEqual({ prompt: 'cat wearing sunglasses', translated: false });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('translates Korean through the LLM', async () => {
		fetchMock.mockResolvedValue(answer('cat wearing sunglasses'));
		expect(await translator().toEnglish('선글라스 낀 고양이')).toEqual({ prompt: 'cat wearing sunglasses', translated: true });
		const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
		expect(url).toBe('http://llm.invalid/v1/chat/completions');
		expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk');
	});

	it('falls back to the original when the LLM is off, fails, or answers in Korean', async () => {
		expect(await translator(false).toEnglish('고양이')).toEqual({ prompt: '고양이', translated: false });
		fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }));
		expect(await translator().toEnglish('고양이')).toEqual({ prompt: '고양이', translated: false });
		fetchMock.mockResolvedValueOnce(answer('고양이'));
		expect(await translator().toEnglish('고양이')).toEqual({ prompt: '고양이', translated: false });
	});
});
