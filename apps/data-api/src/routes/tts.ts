import type { FastifyInstance } from 'fastify';

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
