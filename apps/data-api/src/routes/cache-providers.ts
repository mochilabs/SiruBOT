import type { FastifyInstance } from 'fastify';
import { normalizeTrackingNumber } from '@sirubot/utils/delivery';
import type { WeatherScope } from '@sirubot/utils/weather';
import { z } from 'zod';
import { DataApiError, serveCached } from './serveCached.ts';
import { sendDomainError, sendError } from './common.ts';
import { fetchLyrics, fetchLyricsForTrack, LyricsNotFoundError, lyricsCacheKey, lyricsTrackCacheKey } from '../providers/lyrics.ts';
import { fetchWeather, weatherCacheKey } from '../providers/weather.ts';
import { deliveryTrackCacheKey, searchDeliveryCarriers, trackDelivery } from '../providers/delivery.ts';
import { chaptersCacheKey, fetchYouTubeChaptersFresh } from '../providers/chapters.ts';
import { fetchSponsorBlockSegmentsFresh, sponsorBlockCacheKey, sponsorBlockSegmentsSchema } from '../providers/sponsorblock.ts';
import { sharedCache } from '../utils/cache.ts';
import { getDb } from '../services/db.ts';
import { LyricsTranslator } from '../services/lyricsTranslation.ts';
import type { RouteDeps } from './index.ts';
import { fetchYouTubeSuggestionsFresh, youtubeSuggestionsCacheKey } from '../providers/youtubeSuggestions.ts';

const LYRICS_TTL_SECONDS = 30 * 24 * 3600;
const LYRICS_RETRY_TTL_SECONDS = 15 * 60;
const WEATHER_TTL_SECONDS = 15 * 60;

export function registerCacheProviderRoutes(fastify: FastifyInstance, deps: Pick<RouteDeps, 'translationProvider'>): void {
	const lyricsTranslator = new LyricsTranslator(getDb, deps.translationProvider);
	const lyricsQuery = z
		.object({
			q: z.string().trim().min(1).max(200).optional(),
			title: z.string().trim().min(1).max(200).optional(),
			artist: z.string().trim().max(200).default(''),
			durationMs: z.coerce
				.number()
				.int()
				.min(0)
				.max(24 * 3600 * 1000)
				.default(0),
			source: z.string().trim().max(40).optional(),
			videoId: z
				.string()
				.regex(/^[\w-]{11}$/)
				.optional()
		})
		.refine((v) => v.q || v.title, { message: 'q 또는 title이 필요해요.' });
	fastify.get('/v1/lyrics', async (request, reply) => {
		try {
			const { q, title, artist, durationMs, source, videoId } = lyricsQuery.parse(request.query);
			const track = title ? { title, artist, durationMs, sourceName: source ?? null, videoId: videoId ?? null } : null;
			const { data, cached } = await serveCached({
				route: 'lyrics',
				key: track ? lyricsTrackCacheKey(track) : lyricsCacheKey(q!),
				ttlSeconds: (d) => (d.captionStatus === 'error' ? LYRICS_RETRY_TTL_SECONDS : LYRICS_TTL_SECONDS),
				negativeTtlSeconds: LYRICS_RETRY_TTL_SECONDS,
				provider: 'lrclib',
				fetchFresh: async () => {
					try {
						return await (track ? fetchLyricsForTrack(track) : fetchLyrics(q!));
					} catch (error) {
						if (error instanceof LyricsNotFoundError) throw new DataApiError(404, 'lyrics_not_found', '가사를 찾지 못했어요.');
						throw error;
					}
				},
				validate: (d) => Boolean(d.plainLyrics || d.syncedLyrics)
			});
			const translation = await lyricsTranslator.lookup(data);
			const { captionTranslation: _hint, captionStatus: _status, ...body } = data;
			return reply.send({ ...body, translation, _cached: cached });
		} catch (error) {
			return sendError(reply, error);
		}
	});

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
					} catch {}
				}
				throw error;
			}
		} catch (error) {
			return sendError(reply, error);
		}
	});
}
