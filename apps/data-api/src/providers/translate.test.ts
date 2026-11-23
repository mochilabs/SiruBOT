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

describe('translateHoroscope — Structured Outputs', () => {
	const items = [{ zodiacCode: '01', content: '本文', lucky: 'ラッキーカラー：赤 / 幸運のカギ：手紙' }];
	const reply = (body: unknown) =>
		new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(body) } }] }), {
			status: 200,
			headers: { 'content-type': 'application/json' }
		});

	it('json_schema strict를 요청하고 럭키 컬러·열쇠를 라벨 붙은 lucky로 조립해요', async () => {
		const fetchMock = vi.fn(async () =>
			reply({ items: [{ zodiacCode: '1', content: '번역', luckyColor: '빨강', luckyKey: '편지', luckyItem: '' }] })
		);
		vi.stubGlobal('fetch', fetchMock);
		const map = await provider().translateHoroscope(items);
		const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body);
		expect(sent.response_format.json_schema.strict).toBe(true);
		expect(sent.response_format.json_schema.schema.properties.items.items.required).toEqual(expect.arrayContaining(['luckyColor', 'luckyKey']));
		expect(map.get('01')).toEqual({ zodiacCode: '01', content: '번역', lucky: '럭키 컬러: 빨강 · 행운의 열쇠: 편지' });
	});

	it('필수 필드가 빠진 출력은 거부해요', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => reply({ items: [{ zodiacCode: '01', content: '번역', luckyColor: '빨강' }] }))
		);
		await expect(provider().translateHoroscope(items)).rejects.toThrow(/schema/);
	});

	it('response_format을 거부하는 서버(400)에는 프롬프트 지시만으로 재시도해요', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response('unsupported response_format', { status: 400 }))
			.mockResolvedValueOnce(reply({ items: [{ zodiacCode: '01', content: '번역', luckyColor: '', luckyKey: '', luckyItem: '타올' }] }));
		vi.stubGlobal('fetch', fetchMock);
		const map = await provider().translateHoroscope(items);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(map.get('01')?.lucky).toBe('럭키 아이템: 타올');
	});
});
