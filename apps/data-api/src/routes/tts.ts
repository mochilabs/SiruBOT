import type { FastifyInstance } from 'fastify';

/**
 * siru_tts 음성 카탈로그 프록시 — 대시보드는 siru_tts 주소를 몰라도 돼요(data-api만 보유).
 * `GET /v1/tts/voices?lang=&q=`는 siru_tts `/v1/voices`의 첫 200개를 5분간 캐시해 돌려줘요.
 * SIRU_TTS_URL이 없으면 503이에요. siru_tts는 내부망 전용이라 인증 헤더가 없어요.
 */

const VOICES_TTL_MS = 5 * 60_000;
const VOICES_PAGE_SIZE = 200;
const CACHE_MAX = 50;

export interface TtsProxyDeps {
	ttsUrl?: string;
}

interface VoiceItem {
	id: string;
	engine: string;
	name: string;
	languages: string[];
}

export function registerTtsRoutes(fastify: FastifyInstance, deps: TtsProxyDeps): void {
	const base = deps.ttsUrl?.replace(/\/+$/, '');
	const cache = new Map<string, { at: number; items: VoiceItem[] }>();

	fastify.get<{ Querystring: { lang?: string; q?: string } }>('/v1/tts/voices', async (request, reply) => {
		if (!base) return reply.code(503).send({ error: 'tts_unavailable', message: 'TTS 서버가 설정되지 않았어요.' });
		const params = new URLSearchParams({ page_size: String(VOICES_PAGE_SIZE) });
		const lang = (request.query.lang ?? '').trim().toLowerCase().slice(0, 16);
		const q = (request.query.q ?? '').trim().slice(0, 50);
		if (lang) params.set('lang', lang);
		if (q) params.set('q', q);
		const key = params.toString();

		const hit = cache.get(key);
		if (hit && Date.now() - hit.at < VOICES_TTL_MS) return reply.send({ items: hit.items });

		try {
			const res = await fetch(`${base}/v1/voices?${key}`, { signal: AbortSignal.timeout(5_000) });
			if (!res.ok) return reply.code(502).send({ error: 'tts_upstream', message: '음성 목록을 불러오지 못했어요.' });
			const body = (await res.json()) as { items?: unknown };
			const items: VoiceItem[] = [];
			for (const item of Array.isArray(body.items) ? body.items : []) {
				if (typeof item !== 'object' || item === null) continue;
				const { id, engine, name, languages } = item as Record<string, unknown>;
				if (typeof id !== 'string' || !id) continue;
				items.push({
					id,
					engine: typeof engine === 'string' ? engine : '',
					name: typeof name === 'string' ? name : id,
					languages: Array.isArray(languages) ? languages.filter((l): l is string => typeof l === 'string') : []
				});
			}
			if (items.length > 0) {
				if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
				cache.set(key, { at: Date.now(), items });
			}
			return reply.send({ items });
		} catch {
			return reply.code(502).send({ error: 'tts_unreachable', message: 'TTS 서버에 연결하지 못했어요.' });
		}
	});
}
