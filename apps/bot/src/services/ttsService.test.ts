import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setConfigForTesting } from '../lib/config.ts';
import { makeTestConfig } from '../lib/config.testing.ts';
import { TtsService, getTtsConfig } from './ttsService.ts';

const mocks = vi.hoisted(() => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

vi.mock('@sapphire/framework', () => ({ container: { logger: mocks.logger } }));

const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal('fetch', fetchMock);

/** 반환 타입을 명시하지 않고 추론하게 둬요 — undici-types의 Response 이중화(TS2741) 회피 */
function respondJson(status: number, body: unknown, headers?: Record<string, string>) {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

/** siru_tts 엔드포인트를 URL별로 라우팅하는 fetch 목 */
function routeFetch(handlers: { usage?: () => any; readyz?: () => any; synthesize?: () => any; voices?: () => any }): void {
	fetchMock.mockImplementation(async (input: string | URL | Request) => {
		const url = String(input instanceof Request ? input.url : input);
		if (url.includes('/readyz')) return handlers.readyz ? handlers.readyz() : new Response('', { status: 200 });
		if (url.includes('/v1/voices'))
			return handlers.voices ? handlers.voices() : respondJson(200, { items: [], total: 0, page: 1, page_size: 25 });
		if (url.includes('/v1/synthesize'))
			return handlers.synthesize
				? handlers.synthesize()
				: respondJson(200, {
						url: 'https://tts.example.com/v1/shared/token',
						expires_in: 600,
						format: 'wav',
						cache: 'miss',
						duration_ms: 120
					});
		throw new Error(`unexpected fetch: ${url}`);
	});
}

const TTS_ON = { SIRU_TTS_URL: 'http://tts.invalid', SIRU_TTS_DEFAULT_VOICE: 'edge:ko-KR-SunHiNeural' };

function envOn(): void {
	setConfigForTesting(makeTestConfig(TTS_ON));
}

function envOff(): void {
	setConfigForTesting(makeTestConfig());
}

beforeEach(() => {
	vi.clearAllMocks();
	envOn();
	routeFetch({});
});
afterEach(() => {
	setConfigForTesting(null);
	vi.unstubAllGlobals();
	vi.stubGlobal('fetch', fetchMock);
});

describe('getTtsConfig', () => {
	it('requires only the url — the default voice is optional', () => {
		expect(getTtsConfig()).toEqual({ url: 'http://tts.invalid', defaultVoice: 'edge:ko-KR-SunHiNeural' });
		setConfigForTesting(makeTestConfig({ SIRU_TTS_URL: 'http://tts.invalid' }));
		expect(getTtsConfig()).toEqual({ url: 'http://tts.invalid', defaultVoice: null });
		setConfigForTesting(makeTestConfig());
		expect(getTtsConfig()).toBeNull();
	});

	it('trims trailing slashes from the url', () => {
		setConfigForTesting(makeTestConfig({ SIRU_TTS_URL: 'http://tts.invalid///' }));
		expect(getTtsConfig()?.url).toBe('http://tts.invalid');
	});
});

describe('TtsService disabled state', () => {
	it('warns once at startup and refuses to synthesize', async () => {
		envOff();
		const service = new TtsService();
		expect(mocks.logger.warn).toHaveBeenCalledOnce();
		expect(service.isEnabled()).toBe(false);
		await expect(service.synthesize('안녕')).rejects.toMatchObject({ name: 'TtsError', code: 'not_configured' });
	});
});

describe('TtsService synthesize', () => {
	it('parses the return_url response and sends the documented request body', async () => {
		let sentBody: unknown;
		let headers: Record<string, string> = {};
		routeFetch({
			synthesize: () => {
				const init = fetchMock.mock.calls.at(-1)?.[1] as RequestInit;
				sentBody = JSON.parse(String(init.body));
				headers = init.headers as Record<string, string>;
				return respondJson(200, {
					url: 'https://tts.example.com/v1/shared/Ab3',
					expires_in: 600,
					format: 'wav',
					cache: 'hit',
					duration_ms: 120
				});
			}
		});
		const clip = await new TtsService().synthesize('안녕하세요');
		expect(clip).toEqual({
			url: 'https://tts.example.com/v1/shared/Ab3',
			expiresIn: 600,
			format: 'wav',
			cache: 'hit',
			durationMs: 120,
			warnings: []
		});
		expect(sentBody).toEqual({ text: '안녕하세요', voice: 'edge:ko-KR-SunHiNeural', voice_fallback: true, return_url: true });
		// siru_tts 2.0은 인증 헤더가 없다
		expect(headers).toEqual({ 'Content-Type': 'application/json' });
	});

	it('sends the user voice and a non-neutral emotion', async () => {
		let sentBody: Record<string, unknown> = {};
		routeFetch({
			synthesize: () => {
				const init = fetchMock.mock.calls.at(-1)?.[1] as RequestInit;
				sentBody = JSON.parse(String(init.body));
				return respondJson(200, {
					url: 'https://tts.example.com/v1/shared/p',
					expires_in: 600,
					format: 'wav',
					cache: 'miss',
					duration_ms: 1
				});
			}
		});
		await new TtsService().synthesize('안녕', { voice: 'melo:KR', emotion: 'happy' });
		expect(sentBody).toEqual({ text: '안녕', voice: 'melo:KR', voice_fallback: true, return_url: true, emotion: 'happy' });
	});

	it('omits emotion when neutral and omits voice when no default is configured', async () => {
		let sentBody: Record<string, unknown> = {};
		routeFetch({
			synthesize: () => {
				const init = fetchMock.mock.calls.at(-1)?.[1] as RequestInit;
				sentBody = JSON.parse(String(init.body));
				return respondJson(200, {
					url: 'https://tts.example.com/v1/shared/p',
					expires_in: 600,
					format: 'wav',
					cache: 'miss',
					duration_ms: 1
				});
			}
		});
		setConfigForTesting(makeTestConfig({ SIRU_TTS_URL: 'http://tts.invalid' }));
		await new TtsService().synthesize('안녕', { emotion: 'neutral' });
		expect(sentBody).toEqual({ text: '안녕', return_url: true });
	});

	it('retries once on 503 honoring Retry-After', async () => {
		let calls = 0;
		routeFetch({
			synthesize: () => {
				calls++;
				return calls === 1
					? respondJson(503, { error: { code: 'queue_full', message: 'slow down' } }, { 'Retry-After': '0' })
					: respondJson(200, { url: 'https://tts.example.com/v1/shared/x', expires_in: 600, format: 'wav', cache: 'miss', duration_ms: 1 });
			}
		});
		await expect(new TtsService().synthesize('안녕')).resolves.toMatchObject({ url: 'https://tts.example.com/v1/shared/x' });
		expect(calls).toBe(2);
	});

	it('gives up without retrying when Retry-After exceeds the budget', async () => {
		let calls = 0;
		routeFetch({
			synthesize: () => {
				calls++;
				return respondJson(503, { error: { code: 'queue_full', message: 'slow down' } }, { 'Retry-After': '3600' });
			}
		});
		await expect(new TtsService().synthesize('안녕')).rejects.toMatchObject({ code: 'queue_full' });
		expect(calls).toBe(1);
	});

	it('retries once on 503 and fails after the retry is exhausted', async () => {
		let calls = 0;
		routeFetch({
			synthesize: () => {
				calls++;
				return respondJson(503, { error: { code: 'engine_circuit_open', message: 'warming up' } }, { 'Retry-After': '0' });
			}
		});
		await expect(new TtsService().synthesize('안녕')).rejects.toMatchObject({ code: 'engine_circuit_open' });
		expect(calls).toBe(2);
	});

	it('exposes server warnings such as voice_language_mismatch', async () => {
		routeFetch({
			synthesize: () =>
				respondJson(200, {
					url: 'https://tts.example.com/v1/shared/w',
					expires_in: 600,
					format: 'mp3',
					cache: 'miss',
					duration_ms: 5,
					warnings: ['voice_language_mismatch:ja', 7]
				})
		});
		await expect(new TtsService().synthesize('こんにちは')).resolves.toMatchObject({ warnings: ['voice_language_mismatch:ja'] });
	});

	it('does not retry 504 timeouts', async () => {
		let calls = 0;
		routeFetch({
			synthesize: () => {
				calls++;
				return respondJson(504, { error: { code: 'engine_timeout', message: 'slow' } });
			}
		});
		await expect(new TtsService().synthesize('안녕')).rejects.toMatchObject({ code: 'engine_timeout' });
		expect(calls).toBe(1);
	});

	it('discards 4xx validation errors immediately', async () => {
		let calls = 0;
		routeFetch({
			synthesize: () => {
				calls++;
				return respondJson(400, { error: { code: 'ambiguous_routing', message: 'voice and language' } });
			}
		});
		await expect(new TtsService().synthesize('안녕')).rejects.toMatchObject({ code: 'ambiguous_routing' });
		expect(calls).toBe(1);
	});

	it('checks readyz before the first synthesis and does not re-check afterwards', async () => {
		let readyzCalls = 0;
		routeFetch({
			readyz: () => {
				readyzCalls++;
				return new Response('', { status: 503 });
			}
		});
		const service = new TtsService();
		await expect(service.synthesize('안녕')).rejects.toMatchObject({ code: 'not_ready' });
		expect(fetchMock.mock.calls.filter(([u]) => String(u).includes('/v1/synthesize'))).toHaveLength(0);

		routeFetch({
			readyz: () => {
				readyzCalls++;
				return new Response('', { status: 200 });
			}
		});
		await expect(service.synthesize('안녕')).resolves.toMatchObject({ url: 'https://tts.example.com/v1/shared/token' });
		await expect(service.synthesize('두 번째')).resolves.toMatchObject({ cache: 'miss' });
		expect(readyzCalls).toBe(2);
	});

	it('rejects malformed success bodies', async () => {
		routeFetch({ synthesize: () => respondJson(200, { expires_in: 600, format: 'wav' }) });
		await expect(new TtsService().synthesize('안녕')).rejects.toMatchObject({ code: 'bad_response' });
	});
});

describe('TtsService listVoices', () => {
	it('parses catalog items and passes the query through', async () => {
		let requestedUrl = '';
		routeFetch({
			voices: () => {
				requestedUrl = String(fetchMock.mock.calls.at(-1)?.[0]);
				return respondJson(200, {
					items: [
						{
							id: 'edge:ko-KR-SunHiNeural',
							engine: 'edge',
							name: 'SunHiNeural',
							languages: ['ko-KR'],
							styles: [],
							emotions: [],
							sample_url: null
						},
						{ id: 'melo:KR', engine: 'melo', name: '한국어', languages: ['ko'], styles: [], emotions: [], sample_url: null },
						{ id: 42 }
					],
					total: 2,
					page: 1,
					page_size: 25
				});
			}
		});
		const voices = await new TtsService().listVoices({ query: 'ko-KR' });
		expect(requestedUrl).toContain('/v1/voices?');
		expect(requestedUrl).toContain('q=ko-KR');
		expect(voices).toEqual([
			{ id: 'edge:ko-KR-SunHiNeural', engine: 'edge', name: 'SunHiNeural', languages: ['ko-KR'] },
			{ id: 'melo:KR', engine: 'melo', name: '한국어', languages: ['ko'] }
		]);
	});

	it('passes the language filter and caches successful lists', async () => {
		let calls = 0;
		let requestedUrl = '';
		routeFetch({
			voices: () => {
				calls++;
				requestedUrl = String(fetchMock.mock.calls.at(-1)?.[0]);
				return respondJson(200, { items: [{ id: 'voicevox:3', engine: 'voicevox', name: 'ずんだもん', languages: ['ja'] }] });
			}
		});
		const service = new TtsService();
		await expect(service.listVoices({ lang: 'JA' })).resolves.toHaveLength(1);
		await service.listVoices({ lang: 'ja' });
		expect(requestedUrl).toContain('lang=ja');
		expect(calls).toBe(1);
		// 다른 언어는 별도 캐시 키
		await service.listVoices({ lang: 'ko' });
		expect(calls).toBe(2);
	});

	it('does not cache empty results', async () => {
		let calls = 0;
		routeFetch({
			voices: () => {
				calls++;
				return respondJson(200, { items: [] });
			}
		});
		const service = new TtsService();
		await service.listVoices({ lang: 'ko' });
		await service.listVoices({ lang: 'ko' });
		expect(calls).toBe(2);
	});

	it('returns an empty list when disabled, on error, or on a bad body', async () => {
		envOff();
		expect(await new TtsService().listVoices({ query: 'x' })).toEqual([]);
		envOn();
		routeFetch({ voices: () => Promise.reject(new Error('down')) });
		expect(await new TtsService().listVoices()).toEqual([]);
		routeFetch({ voices: () => respondJson(200, { items: 'nope' }) });
		expect(await new TtsService().listVoices()).toEqual([]);
	});
});
