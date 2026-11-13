import { MemoryCache } from '@sirubot/utils';
import { sleep } from '@sirubot/utils/time';
import type { AppLogger } from '../../../lib/appLogger.ts';

/**
 * 채팅 TTS(siru_tts 2.0) 클라이언트 — 합성 요청·공개 URL 수신·재시도.
 *
 * `POST /v1/synthesize`에 `return_url: true`를 보내 바이트 대신 재생 URL을 받는다.
 * siru_tts는 신뢰하는 내부망 전용이라 인증 헤더가 없다. 계약은 ../siru_tts/OPENAPI.md와 CLIENT.md.
 * `voice`와 `language`는 함께 보낼 수 없다(400 ambiguous_routing) — 이 클라이언트는 voice만 보내고,
 * voice가 없으면 둘 다 생략해 서버가 텍스트 언어로 목소리를 고르게 한다.
 *
 * 재시도는 CLIENT.md의 502/503/504 규칙을 따르되, 채팅 읽기는 늦게 도착한 음성이 무의미하므로
 * 통합 예산 20초 안에서만 재시도한다.
 */

/** 합성 1건의 통합 예산 — 늦게 도착한 채팅 음성은 의미가 없어 짧게 잡는다 */
const TTS_SYNTH_BUDGET_MS = 20_000;
/** readyz 확인 타임아웃 — 예열 확인은 합성보다 가벼운 호출 */
const TTS_PROBE_TIMEOUT_MS = 5_000;
/** 음성 카탈로그 캐시 — 패널을 열 때마다 siru_tts를 두드리지 않게 5분간 보관한다 */
const TTS_VOICES_TTL_MS = 5 * 60_000;
/** 백오프 기본값 — Retry-After가 있으면 그것을 우선하고, 여기에 지터(0~100ms)를 더한다 */
const TTS_BACKOFF_BASE_MS = 300;

/** 재생 URL 포맷 — 엔진이 결정한다(Edge/ElevenLabs는 mp3, VOICEVOX/Typecast/CLOVA는 wav) */
type TtsShareFormat = 'wav' | 'mp3';

export interface TtsClip {
	/** 무인증 공개 URL — 만료(expiresIn) 전에 재생/announce를 시작해야 한다 */
	url: string;
	expiresIn: number;
	format: TtsShareFormat;
	cache: 'hit' | 'miss';
	durationMs: number;
	/** 서버 경고 코드 — `engine_fallback:<engine>`, `voice_language_mismatch:<lang>` 등 */
	warnings: string[];
}

/** 요청 전체에 적용되는 엔진 감정 — 미지원이면 서버가 중립으로 폴백한다 */
export type TtsEmotion = 'neutral' | 'happy' | 'sad' | 'angry' | 'whisper';

/** 사용자 프리셋 — voice는 engine:voice 식별자 */
interface TtsSynthOptions {
	voice?: string;
	emotion?: TtsEmotion;
}

/** catalog 항목 — id는 SynthRequest.voice에 그대로 전달 가능한 engine:voice 식별자 */
export interface TtsVoice {
	id: string;
	engine: string;
	name: string;
	languages: string[];
}

export class TtsError extends Error {
	public constructor(
		public readonly code: string,
		message: string
	) {
		super(message);
		this.name = 'TtsError';
	}
}

/** TTS 서비스가 쓰는 의존성 — 설정은 호출할 때마다 읽어요 (SIRU_TTS_URL이 없으면 null) */
export interface TtsConfig {
	url: string;
	/** 선택 — 비어 있으면 voice를 생략하고 서버가 텍스트 언어로 고른다 */
	defaultVoice: string | null;
}

export interface TtsServiceDeps {
	logger: AppLogger;
	getTtsConfig: () => TtsConfig | null;
}

export class TtsService {
	/** `/readyz` 통과 여부 — 예열 중(503)은 정상이라 다음 합성 시점에 다시 확인한다 */
	private ready = false;
	private readonly voiceCache = new MemoryCache<string, TtsVoice[]>({ ttl: TTS_VOICES_TTL_MS, maxSize: 50 });

	public constructor(private readonly deps: TtsServiceDeps) {
		if (!deps.getTtsConfig()) {
			deps.logger.warn('[tts] SIRU_TTS_URL 미설정 — 채팅 TTS가 꺼져 있어요.');
		}
	}

	public isEnabled(): boolean {
		return this.deps.getTtsConfig() !== null;
	}

	/**
	 * 텍스트를 합성해 공개 URL로 돌려받는다.
	 * 실패는 전부 TtsError로 던진다 — 호출부는 채널에 알리지 않고 조용히 스킵한다(명세 4.6).
	 */
	public async synthesize(text: string, options?: TtsSynthOptions): Promise<TtsClip> {
		const config = this.deps.getTtsConfig();
		if (!config) throw new TtsError('not_configured', 'siru_tts is not configured');
		await this.ensureReady(config);

		const voice = options?.voice ?? config.defaultVoice;
		const deadline = Date.now() + TTS_SYNTH_BUDGET_MS;
		let lastError: TtsError | null = null;
		for (let attempt = 0; attempt < 2; attempt++) {
			const remaining = deadline - Date.now();
			if (remaining <= 0) break;
			let res: Response;
			try {
				res = await fetch(`${config.url}/v1/synthesize`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						text,
						return_url: true,
						// 목소리는 선호값이다 — 다른 언어 채팅이 오면 서버가 언어 경로로 바꿔 읽는다(voice_language_mismatch)
						...(voice ? { voice, voice_fallback: true } : {}),
						...(options?.emotion && options.emotion !== 'neutral' ? { emotion: options.emotion } : {})
					}),
					signal: AbortSignal.timeout(remaining)
				});
			} catch (error) {
				lastError = new TtsError('unreachable', `siru_tts synthesize unreachable: ${error instanceof Error ? error.message : String(error)}`);
				if (attempt === 0 && (await this.backoff(null, deadline))) continue;
				break;
			}
			if (res.ok) return this.parseClip(res);
			const { code, retryAfter } = await this.parseError(res);
			lastError = new TtsError(code, `siru_tts synthesize -> ${res.status}: ${code}`);
			// CLIENT.md: 502/503만 재시도(Retry-After 준수+지터), 504와 4xx는 바로 포기
			const retryable = res.status === 502 || res.status === 503;
			if (retryable && attempt === 0 && (await this.backoff(retryAfter, deadline))) continue;
			break;
		}
		throw lastError ?? new TtsError('timeout', 'siru_tts synthesize budget exceeded');
	}

	/**
	 * 음성 카탈로그 — /tts voice autocomplete용. 쿼리가 비어 있으면 전체 첫 페이지.
	 * 실패 시 빈 배열 — autocomplete는 조용히 빈 선택지만 보여준다.
	 */
	public async listVoices(options: { lang?: string; query?: string } = {}): Promise<TtsVoice[]> {
		const config = this.deps.getTtsConfig();
		if (!config) return [];
		const params = new URLSearchParams({ page_size: '25' });
		const q = (options.query ?? '').trim();
		const lang = (options.lang ?? '').trim().toLowerCase();
		if (q) params.set('q', q);
		if (lang) params.set('lang', lang);
		const cacheKey = params.toString();
		const cached = this.voiceCache.get(cacheKey);
		if (cached) return cached;
		try {
			const res = await fetch(`${config.url}/v1/voices?${params.toString()}`, {
				signal: AbortSignal.timeout(TTS_PROBE_TIMEOUT_MS)
			});
			if (!res.ok) return [];
			const body = (await res.json()) as { items?: unknown };
			if (!Array.isArray(body.items)) return [];
			const voices: TtsVoice[] = [];
			for (const item of body.items) {
				if (typeof item !== 'object' || item === null) continue;
				const { id, engine, name, languages } = item as Record<string, unknown>;
				if (typeof id !== 'string' || id.length === 0) continue;
				voices.push({
					id,
					engine: typeof engine === 'string' ? engine : '',
					name: typeof name === 'string' ? name : id,
					languages: Array.isArray(languages) ? languages.filter((l): l is string => typeof l === 'string') : []
				});
			}
			// 빈 결과는 캐시하지 않는다 — 일시 장애가 5분간 남지 않게
			if (voices.length > 0) this.voiceCache.set(cacheKey, voices);
			return voices;
		} catch {
			return [];
		}
	}

	/** 첫 합성 전 readiness 확인 — 예열 중 503은 정상이라 다음 메시지에서 재확인한다 */
	private async ensureReady(config: TtsConfig): Promise<void> {
		if (this.ready) return;
		let res: Response;
		try {
			res = await fetch(`${config.url}/readyz`, { signal: AbortSignal.timeout(TTS_PROBE_TIMEOUT_MS) });
		} catch (error) {
			throw new TtsError('not_ready', `siru_tts readyz unreachable: ${error instanceof Error ? error.message : String(error)}`);
		}
		if (res.status !== 200) throw new TtsError('not_ready', `siru_tts readyz -> ${res.status}`);
		this.ready = true;
	}

	/** 재시도 대기 — 예산이 남고 대기가 예산 안에 들어오면 true(재시도 진행) */
	private async backoff(retryAfter: number | null, deadline: number): Promise<boolean> {
		const wait = retryAfter !== null ? retryAfter : TTS_BACKOFF_BASE_MS;
		const until = Date.now() + wait + Math.floor(Math.random() * 100);
		if (until >= deadline) return false;
		await sleep(until - Date.now());
		return true;
	}

	private async parseClip(res: Response): Promise<TtsClip> {
		let body: { url?: unknown; expires_in?: unknown; format?: unknown; cache?: unknown; duration_ms?: unknown; warnings?: unknown };
		try {
			body = (await res.json()) as typeof body;
		} catch {
			throw new TtsError('bad_response', 'siru_tts synthesize returned non-JSON body');
		}
		const { url, expires_in: expiresIn, format, cache, duration_ms: durationMs, warnings } = body;
		if (typeof url !== 'string' || url.length === 0) throw new TtsError('bad_response', 'siru_tts synthesize response has no url');
		if (format !== 'wav' && format !== 'mp3')
			throw new TtsError('bad_response', `siru_tts synthesize returned unsupported format: ${String(format)}`);
		return {
			url,
			expiresIn: typeof expiresIn === 'number' && expiresIn > 0 ? expiresIn : 600,
			format,
			cache: cache === 'hit' ? 'hit' : 'miss',
			durationMs: typeof durationMs === 'number' && durationMs >= 0 ? durationMs : 0,
			warnings: Array.isArray(warnings) ? warnings.filter((w): w is string => typeof w === 'string') : []
		};
	}

	private async parseError(res: Response): Promise<{ code: string; retryAfter: number | null }> {
		let code = `http_${res.status}`;
		try {
			const body = (await res.json()) as { error?: { code?: unknown } };
			if (typeof body?.error?.code === 'string' && body.error.code.length > 0) code = body.error.code;
		} catch {
			// envelope이 아니면 상태 코드 기반 코드를 쓴다
		}
		return { code, retryAfter: parseRetryAfter(res.headers.get('retry-after')) };
	}
}

/** Retry-After는 초(정수) 또는 HTTP-date — 둘 다 아니면 null(백오프 기본값 사용) */
function parseRetryAfter(header: string | null): number | null {
	if (!header) return null;
	const seconds = Number(header);
	if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds * 1000));
	const at = Date.parse(header);
	if (Number.isNaN(at)) return null;
	return Math.max(0, at - Date.now());
}
