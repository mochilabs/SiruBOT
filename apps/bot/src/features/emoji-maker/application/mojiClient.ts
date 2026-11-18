/**
 * siru_moji(텍스트→16×16 이모지 생성 서비스) 클라이언트.
 *
 * `POST /v1/generate`에 설명을 보내면 배경이 투명한 PNG(base64)를 n장 돌려받아요.
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

export interface MojiClient {
	isEnabled(): boolean;
	generate(prompt: string, options?: { n?: number; seed?: number }): Promise<MojiDrawing>;
}

export function createMojiClient(deps: MojiClientDeps): MojiClient {
	return {
		isEnabled: () => deps.getMojiConfig() !== null,
		async generate(prompt, options = {}) {
			const config = deps.getMojiConfig();
			if (!config) throw new MojiError('not_configured', 'siru_moji is not configured');
			let res: Response;
			try {
				res = await fetch(`${config.url}/v1/generate`, {
					method: 'POST',
					headers: { 'content-type': 'application/json', authorization: config.authKey },
					body: JSON.stringify({ prompt, n: options.n ?? 4, ...(options.seed !== undefined ? { seed: options.seed } : {}) }),
					signal: AbortSignal.timeout(MOJI_TIMEOUT_MS)
				});
			} catch (error) {
				throw new MojiError('unavailable', `siru_moji request failed: ${error}`, { cause: error });
			}
			if (res.status === 503) throw new MojiError('busy', 'siru_moji queue is full');
			if (!res.ok) {
				const detail = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
				throw new MojiError('unavailable', `siru_moji responded ${res.status}${detail ? ` ${detail}` : ''}`);
			}
			const body = (await res.json().catch(() => null)) as { images?: unknown; seed?: unknown; device?: unknown } | null;
			if (!body || !Array.isArray(body.images) || body.images.length === 0 || !body.images.every((i) => typeof i === 'string')) {
				throw new MojiError('bad_response', 'siru_moji returned no images');
			}
			return {
				images: (body.images as string[]).map((b64) => Buffer.from(b64, 'base64')),
				seed: typeof body.seed === 'number' ? body.seed : (options.seed ?? 0),
				device: typeof body.device === 'string' ? body.device : 'unknown'
			};
		}
	};
}
