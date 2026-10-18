import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
		if (url.includes('/v1/usage'))
			return handlers.usage
				? handlers.usage()
				: respondJson(200, { resets_at: '2026-10-19T00:00:00+09:00', owner: { enabled: true, limit: 1000, used_chars: 10 }, user: null });
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

function envOn(): void {
	process.env.SIRU_TTS_URL = 'http://tts.invalid';
	process.env.SIRU_TTS_API_KEY = 'key';
	process.env.SIRU_TTS_DEFAULT_VOICE = 'edge:ko-KR-SunHiNeural';
}

function envOff(): void {
	delete process.env.SIRU_TTS_URL;
	delete process.env.SIRU_TTS_API_KEY;
	delete process.env.SIRU_TTS_DEFAULT_VOICE;
}

beforeEach(() => {
	vi.clearAllMocks();
	envOn();
	routeFetch({});
});
afterEach(() => {
	envOff();
	vi.unstubAllGlobals();
	vi.stubGlobal('fetch', fetchMock);
});

describe('getTtsConfig', () => {
	it('requires url, key and voice — anything missing disables the feature', () => {
		expect(getTtsConfig()).not.toBeNull();
		delete process.env.SIRU_TTS_API_KEY;
		expect(getTtsConfig()).toBeNull();
		envOn();
		delete process.env.SIRU_TTS_DEFAULT_VOICE;
		expect(getTtsConfig()).toBeNull();
	});

	it('trims trailing slashes from the url', () => {
		process.env.SIRU_TTS_URL = 'http://tts.invalid///';
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
		let auth: string | null = null;
		routeFetch({
			synthesize: () => {
				const init = fetchMock.mock.calls.at(-1)?.[1] as RequestInit;
				sentBody = JSON.parse(String(init.body));
				auth = (init.headers as Record<string, string>).Authorization;
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
		expect(clip).toEqual({ url: 'https://tts.example.com/v1/shared/Ab3', expiresIn: 600, format: 'wav', cache: 'hit', durationMs: 120 });
		expect(sentBody).toEqual({ text: '안녕하세요', voice: 'edge:ko-KR-SunHiNeural', format: 'wav', return_url: true });
		expect(auth).toBe('Bearer key');
	});

	it('merges the user preset (voice/speed/pitch) into the request body', async () => {
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
		await new TtsService().synthesize('안녕', { voice: 'melo:KR', speed: 1.5, pitch: -3 });
		expect(sentBody).toEqual({ text: '안녕', voice: 'melo:KR', format: 'wav', return_url: true, speed: 1.5, pitch: -3 });
	});

	it('omits speed/pitch when the preset leaves them unset', async () => {
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
		await new TtsService().synthesize('안녕', { voice: 'melo:KR', speed: undefined, pitch: undefined });
		expect(sentBody).toEqual({ text: '안녕', voice: 'melo:KR', format: 'wav', return_url: true });
	});

	it('retries once on 429 honoring Retry-After', async () => {
		let calls = 0;
		routeFetch({
			synthesize: () => {
				calls++;
				return calls === 1
					? respondJson(429, { error: { code: 'rate_limited', message: 'slow down' } }, { 'Retry-After': '0' })
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
				return respondJson(429, { error: { code: 'rate_limited', message: 'slow down' } }, { 'Retry-After': '3600' });
			}
		});
		await expect(new TtsService().synthesize('안녕')).rejects.toMatchObject({ code: 'rate_limited' });
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

	it('discards 4xx validation errors immediately', async () => {
		let calls = 0;
		routeFetch({
			synthesize: () => {
				calls++;
				return respondJson(400, { error: { code: 'public_base_unset', message: 'set SIRU_PUBLIC_BASE_URL' } });
			}
		});
		await expect(new TtsService().synthesize('안녕')).rejects.toMatchObject({ code: 'public_base_unset' });
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

describe('TtsService quota guard', () => {
	it('stops synthesizing when the owner quota is nearly exhausted and caches the snapshot', async () => {
		let usageCalls = 0;
		routeFetch({
			usage: () => {
				usageCalls++;
				return respondJson(200, {
					resets_at: '2026-10-19T00:00:00+09:00',
					owner: { enabled: true, limit: 1000, used_chars: 950 },
					user: null
				});
			}
		});
		const service = new TtsService();
		await expect(service.synthesize('안녕')).rejects.toMatchObject({ code: 'quota_blocked' });
		await expect(service.synthesize('또')).rejects.toMatchObject({ code: 'quota_blocked' });
		expect(usageCalls).toBe(1);
		expect(fetchMock.mock.calls.filter(([u]) => String(u).includes('/v1/synthesize'))).toHaveLength(0);
	});

	it('also blocks when the per-user quota is nearly exhausted', async () => {
		routeFetch({
			usage: () =>
				respondJson(200, {
					resets_at: null,
					owner: { enabled: true, limit: 1000, used_chars: 1 },
					user: { enabled: true, limit: 10, used_chars: 9 }
				})
		});
		await expect(new TtsService().synthesize('안녕')).rejects.toMatchObject({ code: 'quota_blocked' });
	});

	it('fails open when the usage snapshot cannot be fetched', async () => {
		routeFetch({ usage: () => Promise.reject(new Error('network down')) });
		await expect(new TtsService().synthesize('안녕')).resolves.toMatchObject({ url: 'https://tts.example.com/v1/shared/token' });
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
		const voices = await new TtsService().listVoices('ko-KR');
		expect(requestedUrl).toContain('/v1/voices?');
		expect(requestedUrl).toContain('q=ko-KR');
		expect(voices).toEqual([
			{ id: 'edge:ko-KR-SunHiNeural', engine: 'edge', name: 'SunHiNeural', languages: ['ko-KR'] },
			{ id: 'melo:KR', engine: 'melo', name: '한국어', languages: ['ko'] }
		]);
	});

	it('returns an empty list when disabled, on error, or on a bad body', async () => {
		envOff();
		expect(await new TtsService().listVoices('x')).toEqual([]);
		envOn();
		routeFetch({ voices: () => Promise.reject(new Error('down')) });
		expect(await new TtsService().listVoices()).toEqual([]);
		routeFetch({ voices: () => respondJson(200, { items: 'nope' }) });
		expect(await new TtsService().listVoices()).toEqual([]);
	});
});
