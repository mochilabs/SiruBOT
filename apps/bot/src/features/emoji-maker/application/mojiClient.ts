const MOJI_TIMEOUT_MS = 45_000;

export interface MojiConfig {
	url: string;
	authKey: string;
}

export interface MojiDrawing {
	images: Buffer[];
	seed: number;
	device: string;
}

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
	getMojiConfig: () => MojiConfig | null;
}

export interface GenerateOptions {
	n?: number;
	seed?: number;
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
