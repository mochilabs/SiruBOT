import { afterEach, describe, expect, it, vi } from 'vitest';

import { OpenAICompatTranslationProvider } from './translate.ts';

function provider(): OpenAICompatTranslationProvider {
	return new OpenAICompatTranslationProvider('https://llm.example.test/v1', 'test-key', 'test-model');
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('chatCompletion 실패 로깅', () => {
	it('quota 초과(429) 응답은 상태 코드와 에러 본문을 함께 남겨요', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							error: {
								message: 'You exceeded your current quota, please check your plan and billing details.',
								code: 'insufficient_quota'
							}
						}),
						{
							status: 429,
							headers: { 'content-type': 'application/json' }
						}
					)
			)
		);
		await expect(provider().chatCompletion('sys', 'user', 'translation provider')).rejects.toThrow(/429[\s\S]*insufficient_quota/);
	});

	it('본문이 비어 있어도 상태 코드는 남아요', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('', { status: 500 }))
		);
		await expect(provider().chatCompletion('sys', 'user', 'tidy provider')).rejects.toThrow('tidy provider failed: 500');
	});

	it('본문은 500자로 잘라 로그를 보호해요', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('x'.repeat(2000), { status: 502 }))
		);
		await expect(provider().chatCompletion('sys', 'user', 'translation provider')).rejects.toThrow(/failed: 502 x{500}$/);
	});
});
