import { container } from '@sapphire/framework';

/**
 * 채팅 TTS(siru_tts) 클라이언트 — 합성 요청·공개 URL 수신·quota 감시·재시도.
 *
 * `POST /v1/synthesize`에 `return_url: true`를 보내 바이트 대신 무인증 공개 URL을 받는다
 * (Lavalink는 식별자 fetch에 Bearer를 붙일 수 없다). 계약은 ../siru_tts/integration.md 4.1의
 * "Public share URL" 절 — URL 발행은 토큰 비추측 capability 주소라 열람 가능한 사람은 제한된다.
 *
 * 재시도는 integration.md 11장 매트릭스를 따르되, 채팅 읽기는 늦게 도착한 음성이 무의미하므로
 * 통합 예산 20초 안에서만 재시도한다(명세 4.7장 의도적 일탈).
 */

/** 합성 1건의 통합 예산 — integration.md 권고(180s)를 의도적으로 줄인 값 */
const TTS_SYNTH_BUDGET_MS = 20_000;
/** readyz 확인 타임아웃 — 예열 확인은 합성보다 가벼운 호출 */
const TTS_PROBE_TIMEOUT_MS = 5_000;
/** 백오프 기본값 — Retry-After가 있으면 그것을 우선하고, 여기에 지터(0~100ms)를 더한다 */
const TTS_BACKOFF_BASE_MS = 300;
/** quota 스냅샷 캐시 — 5분마다 1회 재확인(resets_at 이후 자동 복구) */
const TTS_USAGE_TTL_MS = 5 * 60_000;
/** quota 차단 임계값 — used/limit가 이 비율 이상이면 합성을 멈춘다 */
const TTS_QUOTA_BLOCK_RATIO = 0.9;

/** 공개 URL로 발행 가능한 포맷 — pcm_s16le_48k_stereo는 share가 거부된다 */
export type TtsShareFormat = 'wav' | 'opus' | 'mp3';

export interface TtsConfig {
	url: string;
	apiKey: string;
	defaultVoice: string;
}

export interface TtsClip {
	/** 무인증 공개 URL — 만료(expiresIn) 전에 재생/announce를 시작해야 한다 */
	url: string;
	expiresIn: number;
	format: TtsShareFormat;
	cache: 'hit' | 'miss';
	durationMs: number;
}

/** 사용자 프리셋 — voice는 engine:voice 식별자, speed/pitch는 미설정이면 엔진 기본값 */
export interface TtsSynthOptions {
	voice?: string;
	speed?: number;
	pitch?: number;
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

interface QuotaUsageBody {
	enabled?: boolean;
	limit?: number | null;
	used_chars?: number;
}

interface UsageResponseBody {
	resets_at?: string;
	owner?: QuotaUsageBody;
	user?: QuotaUsageBody | null;
}

interface UsageSnapshot {
	at: number;
	blocked: boolean;
	resetsAt: string | null;
}

/** env에서 siru_tts 접속 정보를 읽는다 — 셋 중 하나라도 없으면 기능 off(명세 4.6). */
export function getTtsConfig(): TtsConfig | null {
	const url = (process.env.SIRU_TTS_URL ?? '').trim().replace(/\/+$/, '');
	const apiKey = (process.env.SIRU_TTS_API_KEY ?? '').trim();
	const defaultVoice = (process.env.SIRU_TTS_DEFAULT_VOICE ?? '').trim();
	if (!url || !apiKey || !defaultVoice) return null;
	return { url, apiKey, defaultVoice };
}

function quotaNearlySpent(quota: QuotaUsageBody | null | undefined): boolean {
	if (!quota?.enabled || !quota.limit || quota.used_chars === undefined) return false;
	return quota.used_chars / quota.limit >= TTS_QUOTA_BLOCK_RATIO;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export class TtsService {
	/** `/readyz` 통과 여부 — 예열 중(503)은 정상이라 다음 합성 시점에 다시 확인한다 */
	private ready = false;
	private usage: UsageSnapshot | null = null;

	public constructor() {
		if (!getTtsConfig()) {
			container.logger.warn('[tts] SIRU_TTS_URL / SIRU_TTS_API_KEY / SIRU_TTS_DEFAULT_VOICE 미설정 — 채팅 TTS가 꺼져 있어요.');
		}
	}

	public isEnabled(): boolean {
		return getTtsConfig() !== null;
	}

	/**
	 * 텍스트를 합성해 공개 URL로 돌려받는다.
	 * 실패는 전부 TtsError로 던진다 — 호출부는 채널에 알리지 않고 조용히 스킵한다(명세 4.6).
	 */
	public async synthesize(text: string, options?: TtsSynthOptions): Promise<TtsClip> {
		const config = getTtsConfig();
		if (!config) throw new TtsError('not_configured', 'siru_tts is not configured');
		if (!(await this.isQuotaAvailable())) throw new TtsError('quota_blocked', 'daily character quota is nearly exhausted');
		await this.ensureReady(config);

		const deadline = Date.now() + TTS_SYNTH_BUDGET_MS;
		let lastError: TtsError | null = null;
		for (let attempt = 0; attempt < 2; attempt++) {
			const remaining = deadline - Date.now();
			if (remaining <= 0) break;
			let res: Response;
			try {
				res = await fetch(`${config.url}/v1/synthesize`, {
					method: 'POST',
					headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
					body: JSON.stringify({
						text,
						voice: options?.voice ?? config.defaultVoice,
						format: 'wav',
						return_url: true,
						...(options?.speed !== undefined ? { speed: options.speed } : {}),
						...(options?.pitch !== undefined ? { pitch: options.pitch } : {})
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
			// integration.md 11장: 429/503은 Retry-After 준수 백오프+지터, 500/502는 백오프 1회, 나머지 4xx는 즉시 폐기
			const retryable = res.status === 429 || res.status === 500 || res.status === 502 || res.status === 503;
			if (retryable && attempt === 0 && (await this.backoff(retryAfter, deadline))) continue;
			break;
		}
		throw lastError ?? new TtsError('timeout', 'siru_tts synthesize budget exceeded');
	}

	/**
	 * 음성 카탈로그 — /tts voice autocomplete용. 쿼리가 비어 있으면 전체 첫 페이지.
	 * 실패 시 빈 배열 — autocomplete는 조용히 빈 선택지만 보여준다.
	 */
	public async listVoices(query?: string): Promise<TtsVoice[]> {
		const config = getTtsConfig();
		if (!config) return [];
		const params = new URLSearchParams({ page_size: '25' });
		const q = (query ?? '').trim();
		if (q) params.set('q', q);
		try {
			const res = await fetch(`${config.url}/v1/voices?${params.toString()}`, {
				headers: { Authorization: `Bearer ${config.apiKey}` },
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
			return voices;
		} catch {
			return [];
		}
	}

	/**
	 * quota 감시 스냅샷 — 5분 캐시. 임계값(90%) 이상 소진이면 false(합성 중단).
	 * 스냅샷 조회에 실패해도 합성은 막지 않는다 — 실제 안전장치는 429 응답이다.
	 */
	public async isQuotaAvailable(): Promise<boolean> {
		const now = Date.now();
		if (this.usage && now - this.usage.at < TTS_USAGE_TTL_MS) return !this.usage.blocked;
		const config = getTtsConfig();
		if (!config) return false;
		try {
			const res = await fetch(`${config.url}/v1/usage`, {
				headers: { Authorization: `Bearer ${config.apiKey}` },
				signal: AbortSignal.timeout(TTS_PROBE_TIMEOUT_MS)
			});
			if (!res.ok) {
				this.usage = { at: now, blocked: false, resetsAt: null };
				return true;
			}
			const body = (await res.json()) as UsageResponseBody;
			// user_id 없이 합성하므로 owner 구간이 과금 대상이지만, user 구간이 함께 쌓이면 둘 다 본다
			const blocked = quotaNearlySpent(body.owner) || quotaNearlySpent(body.user);
			this.usage = { at: now, blocked, resetsAt: body.resets_at ?? null };
			if (blocked)
				container.logger.warn(
					`[tts] quota ${TTS_QUOTA_BLOCK_RATIO * 100}% 소진 — 낭독을 멈춰요 (resets_at=${this.usage.resetsAt ?? 'unknown'})`
				);
			return !blocked;
		} catch {
			this.usage = { at: now, blocked: false, resetsAt: null };
			return true;
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
		let body: { url?: unknown; expires_in?: unknown; format?: unknown; cache?: unknown; duration_ms?: unknown };
		try {
			body = (await res.json()) as typeof body;
		} catch {
			throw new TtsError('bad_response', 'siru_tts synthesize returned non-JSON body');
		}
		const { url, expires_in: expiresIn, format, cache, duration_ms: durationMs } = body;
		if (typeof url !== 'string' || url.length === 0) throw new TtsError('bad_response', 'siru_tts synthesize response has no url');
		if (format !== 'wav' && format !== 'opus' && format !== 'mp3')
			throw new TtsError('bad_response', `siru_tts synthesize returned unsupported format: ${String(format)}`);
		return {
			url,
			expiresIn: typeof expiresIn === 'number' && expiresIn > 0 ? expiresIn : 600,
			format,
			cache: cache === 'hit' ? 'hit' : 'miss',
			durationMs: typeof durationMs === 'number' && durationMs >= 0 ? durationMs : 0
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
