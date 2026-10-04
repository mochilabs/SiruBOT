import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sharedCache } from '../utils/cache.ts';
import { breaker } from '../utils/breaker.ts';
import { inflightCount } from '../utils/dedup.ts';
import { metrics } from '../utils/metrics.ts';
import { DataApiError, serveCached } from './serveCached.ts';
import { fetchLyrics, lyricsCacheKey } from '../providers/lyrics.ts';
import { chaptersCacheKey, fetchYouTubeChaptersFresh } from '../providers/chapters.ts';
import { fetchOhaasaRaw, getTodayDateString, ohaasaCacheKey } from '../providers/ohaasa.ts';
import { translateDaily } from '../providers/translate.ts';
import { lastGoodDaily, ohaasaStatus, refreshOhaasaNow } from '../services/ohaasaScheduler.ts';
import type { OpenAICompatTranslationProvider } from '../providers/translate.ts';
import { fetchWeather, weatherCacheKey, type WeatherScope } from '../providers/weather.ts';

const LYRICS_TTL_SECONDS = 30 * 24 * 3600;
const WEATHER_TTL_SECONDS = 15 * 60;

export interface RouteDeps {
	translationProvider: OpenAICompatTranslationProvider;
}

function sendError(reply: { code: (n: number) => any }, error: unknown): any {
	if (error instanceof DataApiError) {
		return reply.code(error.status).send({ error: error.code, message: error.message });
	}
	if (error instanceof z.ZodError) {
		return reply.code(400).send({
			error: 'invalid_params',
			message: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
		});
	}
	return reply.code(500).send({
		error: 'internal_error',
		message: '일시적인 오류예요. 잠시 후 다시 시도해 주세요.'
	});
}

export async function registerRoutes(fastify: FastifyInstance, deps: RouteDeps): Promise<void> {
	fastify.get('/api/health', async () => ({
		ok: true,
		service: 'data-api',
		redis: sharedCache.connected
	}));

	fastify.get('/v1/status', async () => ({
		ok: true,
		redis: sharedCache.connected,
		cache: sharedCache.stats(),
		inflight: inflightCount(),
		routes: metrics.snapshot(),
		breakers: breaker.snapshot(),
		translation: {
			provider: deps.translationProvider.name,
			available: deps.translationProvider.available
		},
		ohaasa: ohaasaStatus()
	}));

	// ── 오하아사 (오늘 JST 키 단일화: 캐시는 항상 번역본) ──
	fastify.get('/v1/ohaasa', async (_request, reply) => {
		try {
			const { data, cached } = await serveCached({
				route: 'ohaasa',
				key: ohaasaCacheKey(getTodayDateString()),
				ttlSeconds: 7 * 24 * 3600,
				provider: 'ohaasa',
				fetchFresh: async () => {
					const raw = await fetchOhaasaRaw();
					if (deps.translationProvider.available) {
						try {
							return await translateDaily(raw, deps.translationProvider);
						} catch {
							return raw;
						}
					}
					return raw;
				},
				validate: (d) => Array.isArray(d.horoscopes) && d.horoscopes.length > 0
			}).catch(async (error) => {
				// upstream 전멸 → 스케줄러의 마지막 성공 본
				const stale = lastGoodDaily();
				if (stale) {
					metrics.hit('ohaasa');
					return { data: stale, cached: true as boolean };
				}
				throw error;
			});
			return reply.send({ ...data, _cached: cached });
		} catch (error) {
			return sendError(reply, error);
		}
	});

	fastify.post('/v1/ohaasa/refresh', async (_request, reply) => {
		try {
			const daily = await refreshOhaasaNow(deps.translationProvider.available ? deps.translationProvider : null);
			return reply.send(daily);
		} catch (error) {
			return sendError(reply, error);
		}
	});

	// ── 가사 ──
	const lyricsQuery = z.object({ q: z.string().trim().min(1).max(200) });
	fastify.get('/v1/lyrics', async (request, reply) => {
		try {
			const { q } = lyricsQuery.parse(request.query);
			const { data, cached } = await serveCached({
				route: 'lyrics',
				key: lyricsCacheKey(q),
				ttlSeconds: LYRICS_TTL_SECONDS,
				provider: 'lrclib',
				fetchFresh: () => fetchLyrics(q),
				validate: (d) => Boolean(d.plainLyrics || d.syncedLyrics)
			});
			return reply.send({ ...data, _cached: cached });
		} catch (error) {
			return sendError(reply, error);
		}
	});

	// ── 날씨 ──
	const weatherQuery = z.object({
		location: z.string().trim().min(1).max(200),
		scope: z.enum(['now', 'today', 'tomorrow', 'week']).default('now')
	});
	fastify.get('/v1/weather', async (request, reply) => {
		try {
			const { location, scope } = weatherQuery.parse(request.query);
			const { data, cached } = await serveCached({
				route: 'weather',
				key: weatherCacheKey(location, scope as WeatherScope),
				ttlSeconds: WEATHER_TTL_SECONDS,
				provider: 'open-meteo',
				fetchFresh: () => fetchWeather(location, scope as WeatherScope)
			});
			return reply.send({ ...data, _cached: cached });
		} catch (error) {
			if (error instanceof Error && error.name === 'WeatherError') {
				const e = error as { identifier?: string };
				return reply.code(400).send({
					error: e.identifier ?? 'weather_error',
					message: error.message
				});
			}
			return sendError(reply, error);
		}
	});

	// ── 유튜브 챕터 ──
	const chaptersQuery = z.object({
		videoId: z.string().trim().min(5).max(20),
		durationMs: z.coerce
			.number()
			.int()
			.positive()
			.max(12 * 3600_000)
	});
	fastify.get('/v1/chapters', async (request, reply) => {
		try {
			const { videoId, durationMs } = chaptersQuery.parse(request.query);
			const { data, cached } = await serveCached({
				route: 'chapters',
				key: chaptersCacheKey(videoId, durationMs),
				ttlSeconds: 30 * 60,
				provider: 'youtube',
				fetchFresh: () => fetchYouTubeChaptersFresh(videoId, durationMs),
				validate: (d) => Array.isArray(d)
			});
			return reply.send({ chapters: data, _cached: cached });
		} catch (error) {
			return sendError(reply, error);
		}
	});
}
