import type { FastifyInstance } from 'fastify';
import { normalizeTrackingNumber } from '@sirubot/utils/delivery';
import type { WeatherScope } from '@sirubot/utils/weather';
import { z } from 'zod';
import { serveCached } from './serveCached.ts';
import { sendDomainError, sendError } from './common.ts';
import { fetchLyrics, lyricsCacheKey } from '../providers/lyrics.ts';
import { fetchWeather, weatherCacheKey } from '../providers/weather.ts';
import { deliveryTrackCacheKey, searchDeliveryCarriers, trackDelivery } from '../providers/delivery.ts';
import { chaptersCacheKey, fetchYouTubeChaptersFresh } from '../providers/chapters.ts';
import { fetchSponsorBlockSegmentsFresh, sponsorBlockCacheKey, sponsorBlockSegmentsSchema } from '../providers/sponsorblock.ts';
import { sharedCache } from '../utils/cache.ts';
import { fetchYouTubeSuggestionsFresh, youtubeSuggestionsCacheKey } from '../providers/youtubeSuggestions.ts';

/** 캐시형 외부 프로바이더 읽기 — 가사(lrclib)·날씨(Open-Meteo)·택배(tracker.delivery)·유튜브 챕터. TTL은 라우트 단위 상수로 여기에 둬요. */

const LYRICS_TTL_SECONDS = 30 * 24 * 3600;
const WEATHER_TTL_SECONDS = 15 * 60;

export function registerCacheProviderRoutes(fastify: FastifyInstance): void {
	// 가사
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

	// 날씨
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
			if (error instanceof Error && error.name === 'WeatherError') return sendDomainError(reply, error, 'weather_error');
			return sendError(reply, error);
		}
	});

	// 택배 조회
	const deliveryTrackQuery = z.object({
		carrier: z.string().trim().min(1).max(100),
		number: z.string().trim().min(4).max(50)
	});
	fastify.get('/v1/delivery/track', async (request, reply) => {
		try {
			const { carrier, number } = deliveryTrackQuery.parse(request.query);
			const trackingNumber = normalizeTrackingNumber(number);
			const { data, cached } = await serveCached({
				route: 'delivery-track',
				key: deliveryTrackCacheKey(carrier.trim().toLowerCase(), trackingNumber),
				ttlSeconds: 5 * 60,
				provider: 'tracker-delivery',
				fetchFresh: () => trackDelivery(carrier, trackingNumber)
			});
			return reply.send({ ...data, _cached: cached });
		} catch (error) {
			if (error instanceof Error && error.name === 'DeliveryError') return sendDomainError(reply, error, 'delivery_error');
			return sendError(reply, error);
		}
	});

	// 택배사 검색 — 봇 `/택배 택배사` 자동완성용. 목록은 24시간 캐시(provider) 안에서만 조회해요.
	const deliveryCarriersQuery = z.object({ q: z.string().trim().max(100).default('') });
	fastify.get('/v1/delivery/carriers', async (request, reply) => {
		try {
			const { q } = deliveryCarriersQuery.parse(request.query);
			return reply.send({ carriers: await searchDeliveryCarriers(q) });
		} catch (error) {
			if (error instanceof Error && error.name === 'DeliveryError') return sendDomainError(reply, error, 'delivery_error');
			return sendError(reply, error);
		}
	});

	// 유튜브 챕터
	const chaptersQuery = z.object({
		videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
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
				ttlSeconds: (chapters) => (chapters.length > 0 ? 12 * 3600 : 3600),
				provider: 'youtube',
				fetchFresh: () => fetchYouTubeChaptersFresh(videoId, durationMs),
				validate: (d) => Array.isArray(d)
			});
			return reply.send({ chapters: data, _cached: cached });
		} catch (error) {
			return sendError(reply, error);
		}
	});

	fastify.get('/v1/youtube/suggestions', async (request, reply) => {
		try {
			const { q } = z.object({ q: z.string().trim().min(2).max(100) }).parse(request.query);
			const { data, cached } = await serveCached({
				route: 'youtube-suggestions',
				key: youtubeSuggestionsCacheKey(q),
				ttlSeconds: 10 * 60,
				provider: 'youtube',
				fetchFresh: () => fetchYouTubeSuggestionsFresh(q),
				validate: (suggestions) => Array.isArray(suggestions)
			});
			return reply.send({ suggestions: data, _cached: cached });
		} catch (error) {
			return sendError(reply, error);
		}
	});

	const sponsorBlockQuery = z.object({ videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/) });
	fastify.get('/v1/sponsorblock/segments', async (request, reply) => {
		try {
			const { videoId } = sponsorBlockQuery.parse(request.query);
			const key = sponsorBlockCacheKey(videoId);
			const staleKey = `${key}:stale`;
			try {
				const { data, cached } = await serveCached({
					route: 'sponsorblock',
					key,
					ttlSeconds: (segments) => (segments.length > 0 ? 24 * 3600 : 3600),
					provider: 'sponsorblock',
					fetchFresh: () => fetchSponsorBlockSegmentsFresh(videoId),
					validate: (segments) => sponsorBlockSegmentsSchema.safeParse(segments).success
				});
				if (!cached) await sharedCache.set(staleKey, JSON.stringify(data), 7 * 24 * 3600);
				return reply.send({ segments: data, _cached: cached, stale: false });
			} catch (error) {
				const stale = await sharedCache.get(staleKey);
				if (stale) {
					try {
						const segments = sponsorBlockSegmentsSchema.parse(JSON.parse(stale));
						if (segments.length > 0) return reply.send({ segments, _cached: true, stale: true });
					} catch {
						// 손상된 stale 캐시는 원래 upstream 오류를 반환해요.
					}
				}
				throw error;
			}
		} catch (error) {
			return sendError(reply, error);
		}
	});
}
