/**
 * siru_moji(텍스트→16×16 이모지 생성 서비스) 클라이언트.
 *
 * `POST /v1/generate/stream`으로 진행 상황(대기열 순서·단계별 미리보기)을 NDJSON으로 받다가
 * 마지막 `done` 이벤트의 PNG(base64) n장을 돌려줘요. 서버가 스트리밍을 모르면(404) `POST /v1/generate`로 한 번에 받아요.
 * 인증은 다른 내부 서비스처럼 `Authorization` 헤더에 키 원문을 넣어요(Bearer 없음).
 * 서버는 생성을 한 번에 하나씩 처리하고 대기열이 차면 503을 줘요 — 그건 'busy'로 구분해요.
 */

/** 생성 1건의 타임아웃 — GPU면 1~2초, CPU 폴백이면 10초 안팎이라 대기열을 감안해 넉넉히 잡아요. */
const MOJI_TIMEOUT_MS = 45_000;

export interface MojiConfig {
	url: string;
	authKey: string;
}

export interface MojiDrawing {
	images: Buffer[];
	/** 같은 seed + 설명이면 같은 그림이 나와요. */
	seed: number;
	/** 서버가 실제로 쓴 장치 — 'webgpu' 또는 'cpu' */
	device: string;
}

/** 생성 진행 상황 — queued는 앞에 다른 생성이 있을 때만 와요. preview는 후보를 가로로 이은 PNG예요. */
export type MojiProgress = { type: 'queued'; ahead: number } | { type: 'start' } | { type: 'step'; step: number; total: number; preview: Buffer };

export type MojiErrorCode = 'not_configured' | 'busy' | 'unavailable' | 'bad_response';

export class MojiError extends Error {
	public constructor(
		public readonly code: MojiErrorCode,
		message: string,
		options?: { cause?: unknown }
	) {
		super(message, options);
		this.name = 'MojiError';
	}
}

export interface MojiClientDeps {
	/** 호출할 때마다 읽어요 — SIRU_MOJI_URL이 없으면 null(기능 off). */
	getMojiConfig: () => MojiConfig | null;
}

export interface GenerateOptions {
	n?: number;
	seed?: number;
	/** 진행 이벤트마다 불려요. 던져도 생성은 계속돼요(로그는 호출자가 남겨요). */
	onProgress?: (progress: MojiProgress) => void;
}

export interface MojiClient {
	isEnabled(): boolean;
	generate(prompt: string, options?: GenerateOptions): Promise<MojiDrawing>;
}

function toDrawing(body: Record<string, unknown> | null, fallbackSeed: number): MojiDrawing {
	if (!body || !Array.isArray(body.images) || body.images.length === 0 || !body.images.every((i) => typeof i === 'string')) {
		throw new MojiError('bad_response', 'siru_moji returned no images');
	}
	return {
		images: (body.images as string[]).map((b64) => Buffer.from(b64, 'base64')),
		seed: typeof body.seed === 'number' ? body.seed : fallbackSeed,
		device: typeof body.device === 'string' ? body.device : 'unknown'
	};
}

async function failFromResponse(res: Response): Promise<never> {
	if (res.status === 503) throw new MojiError('busy', 'siru_moji queue is full');
	const detail = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
	throw new MojiError('unavailable', `siru_moji responded ${res.status}${detail ? ` ${detail}` : ''}`);
}

/** NDJSON 본문을 줄 단위로 읽어요. 청크 경계에서 잘린 줄은 다음 청크와 이어 붙여요. */
async function* ndjsonLines(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
	const decoder = new TextDecoder();
	let buffer = '';
	for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
		buffer += decoder.decode(chunk, { stream: true });
		let newline: number;
		while ((newline = buffer.indexOf('\n')) !== -1) {
			const line = buffer.slice(0, newline).trim();
			buffer = buffer.slice(newline + 1);
			if (line) yield JSON.parse(line);
		}
	}
	const rest = (buffer + decoder.decode()).trim();
	if (rest) yield JSON.parse(rest);
}

export function createMojiClient(deps: MojiClientDeps): MojiClient {
	const post = (config: MojiConfig, path: string, body: object) =>
		fetch(`${config.url}${path}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', authorization: config.authKey },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(MOJI_TIMEOUT_MS)
		});

	return {
		isEnabled: () => deps.getMojiConfig() !== null,
		async generate(prompt, options = {}) {
			const config = deps.getMojiConfig();
			if (!config) throw new MojiError('not_configured', 'siru_moji is not configured');
			const body = { prompt, n: options.n ?? 4, ...(options.seed !== undefined ? { seed: options.seed } : {}) };
			const fallbackSeed = options.seed ?? 0;
			const emit = (progress: MojiProgress) => {
				try {
					options.onProgress?.(progress);
				} catch {
					// 진행 표시 실패가 생성 결과를 버리게 두지 않아요.
				}
			};

			try {
				let res = await post(config, '/v1/generate/stream', body);
				// 스트리밍을 모르는 예전 서버 — 한 번에 받는 엔드포인트로 내려가요.
				if (res.status === 404) {
					res = await post(config, '/v1/generate', body);
					if (!res.ok) await failFromResponse(res);
					return toDrawing((await res.json().catch(() => null)) as Record<string, unknown> | null, fallbackSeed);
				}
				if (!res.ok) await failFromResponse(res);
				if (!res.body) throw new MojiError('bad_response', 'siru_moji stream has no body');

				for await (const raw of ndjsonLines(res.body)) {
					const event = raw as { type?: unknown; [key: string]: unknown };
					if (event.type === 'queued' && typeof event.ahead === 'number') emit({ type: 'queued', ahead: event.ahead });
					else if (event.type === 'start') emit({ type: 'start' });
					else if (
						event.type === 'step' &&
						typeof event.step === 'number' &&
						typeof event.total === 'number' &&
						typeof event.preview === 'string'
					) {
						emit({ type: 'step', step: event.step, total: event.total, preview: Buffer.from(event.preview, 'base64') });
					} else if (event.type === 'done') return toDrawing(event, fallbackSeed);
					else if (event.type === 'error') {
						if (event.status === 503) throw new MojiError('busy', 'siru_moji queue is full');
						throw new MojiError('unavailable', `siru_moji stream error: ${String(event.error ?? 'unknown')}`);
					}
				}
				throw new MojiError('bad_response', 'siru_moji stream ended without a result');
			} catch (error) {
				if (error instanceof MojiError) throw error;
				throw new MojiError('unavailable', `siru_moji request failed: ${error}`, { cause: error });
			}
		}
	};
}
