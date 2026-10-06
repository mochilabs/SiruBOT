import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sharedCache } from '../utils/cache.ts';
import { breaker } from '../utils/breaker.ts';
import { inflightCount } from '../utils/dedup.ts';
import { metrics } from '../utils/metrics.ts';
import { DataApiError, serveCached } from './serveCached.ts';
import { deduped } from '../utils/dedup.ts';
import { fetchLyrics, lyricsCacheKey } from '../providers/lyrics.ts';
import { chaptersCacheKey, fetchYouTubeChaptersFresh } from '../providers/chapters.ts';
import { renderProfileCard } from '../renderers/profileCard.ts';
import { renderNowPlayingCard } from '../renderers/nowPlayingCard.ts';
import { renderOhaasaCard } from '../renderers/ohaasaCard.ts';
import { deliveryCarriersCacheKey, deliveryTrackCacheKey, listCarriers, normalizeTrackingNumber, trackDelivery } from '../providers/delivery.ts';
import { fetchOhaasaRaw, getTodayDateString, ohaasaCacheKey } from '../providers/ohaasa.ts';
import { translateDaily } from '../providers/translate.ts';
import { lastGoodDaily, ohaasaStatus, refreshOhaasaNow } from '../services/ohaasaScheduler.ts';
import type { OpenAICompatTranslationProvider } from '../providers/translate.ts';
import { recordPlaybackEvent, recentPlaybackEvents, playbackSnapshot, type PlaybackEventType } from '../services/playbackStore.ts';
import { memoryTidyStatus } from '../services/memoryTidy.ts';
import { registerDashboard } from './dashboard.ts';
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
	const stack = error instanceof Error ? error.stack : undefined;
	const detail = error instanceof Error ? error.message : String(error);
	console.error(`[data-api] unhandled route error: ${detail}${stack ? `\n${stack}` : ''}`);
	return reply.code(500).send({
		error: 'internal_error',
		message: '일시적인 오류예요. 잠시 후 다시 시도해 주세요.',
		detail
	});
}

export async function registerRoutes(fastify: FastifyInstance, deps: RouteDeps): Promise<void> {
	fastify.get('/api/health', async () => ({
		ok: true,
		service: 'data-api',
		redis: sharedCache.connected
	}));

	// 자체 모니터링 대시보드 (서드파티 0) — auth 제외 대상에 추가
	registerDashboard(fastify);

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
		ohaasa: ohaasaStatus(),
		playback: playbackSnapshot(),
		memoryTidy: memoryTidyStatus()
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

	// ── 재생 이벤트 수집 (봇 trackHandler → fire-and-forget) ──
	const playbackEventSchema = z.object({
		type: z.enum(['track_start', 'track_end', 'track_stuck', 'track_error', 'queue_end', 'playback_abort']),
		guildId: z.string().trim().min(1).max(32),
		shardId: z.number().int().min(0).nullable().default(null),
		trackTitle: z.string().max(500).nullable().default(null),
		trackAuthor: z.string().max(500).nullable().default(null),
		trackId: z.string().max(200).nullable().default(null),
		reason: z.string().max(200).nullable().default(null),
		consecutiveErrors: z.number().int().min(0).max(100).default(0)
	});
	fastify.post('/v1/playback/events', async (request, reply) => {
		try {
			const body = playbackEventSchema.parse(request.body);
			recordPlaybackEvent({ ...body, type: body.type as PlaybackEventType, at: Date.now() });
			return reply.send({ ok: true });
		} catch (error) {
			return sendError(reply, error);
		}
	});

	fastify.get('/v1/playback/recent', async (request, reply) => {
		try {
			const query = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) }).parse(request.query);
			return reply.send({ events: recentPlaybackEvents(query.limit) });
		} catch (error) {
			return sendError(reply, error);
		}
	});

	// ── 택배 조회 ──
	fastify.get('/v1/delivery/carriers', async (_request, reply) => {
		try {
			const { data, cached } = await serveCached({
				route: 'delivery-carriers',
				key: deliveryCarriersCacheKey(),
				ttlSeconds: 24 * 3600,
				provider: 'tracker-delivery',
				fetchFresh: () => listCarriers(),
				validate: (d) => Array.isArray(d)
			});
			return reply.send({ carriers: data, _cached: cached });
		} catch (error) {
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
			if (error instanceof Error && error.name === 'DeliveryError') {
				const e = error as { identifier?: string };
				return reply.code(400).send({ error: e.identifier ?? 'delivery_error', message: error.message });
			}
			return sendError(reply, error);
		}
	});

	// ── 프로필 카드 이미지 ──
	const profileCardSchema = z.object({
		userId: z.string().trim().min(1).max(32),
		displayName: z.string().trim().min(1).max(64),
		username: z.string().trim().min(1).max(64),
		avatarUrl: z.string().url().nullable().default(null),
		bannerUrl: z.string().url().nullable().default(null),
		zodiacCode: z.string().trim().max(4).nullable().default(null),
		zodiacKo: z.string().trim().max(24),
		zodiacJp: z.string().trim().max(24).nullable().default(null),
		birthMonth: z.number().int().min(1).max(12).nullable().default(null),
		birthDay: z.number().int().min(1).max(31).nullable().default(null),
		playlistCount: z.number().int().min(0).max(1000).default(0),
		requestedCount: z.number().int().min(0).max(10_000_000).default(0),
		listenText: z.string().trim().max(48).default('0초'),
		accountCreated: z.string().trim().max(40).nullable().default(null),
		guildJoinedAt: z.string().trim().max(40).nullable().default(null),
		topTracks: z
			.array(
				z.object({
					title: z.string().trim().max(120),
					artist: z.string().trim().max(120),
					thumbnailUrl: z.string().url().nullable().default(null)
				})
			)
			.max(3)
			.default([])
	});
	fastify.post('/v1/image/profile', async (request, reply) => {
		try {
			const body = profileCardSchema.parse(request.body);
			const buffer = await deduped(`img:card:${body.userId}`, () => renderProfileCard(body));
			metrics.request('image-profile');
			return reply.type('image/png').send(buffer);
		} catch (error) {
			return sendError(reply, error);
		}
	});

	// ── NowPlaying 카드 이미지 ──
	// position은 렌더 시점에 박히고 캐시 키(trackId)에서는 제외해요 — 봇이 트랙당 1회만 렌더해요.
	const nowPlayingCardSchema = z.object({
		trackId: z.string().trim().min(1).max(200),
		title: z.string().trim().min(1).max(200),
		artist: z.string().trim().min(1).max(200),
		artworkUrl: z.string().url().nullable().default(null),
		positionMs: z
			.number()
			.int()
			.min(0)
			.max(24 * 3600_000)
			.default(0),
		durationMs: z
			.number()
			.int()
			.min(0)
			.max(24 * 3600_000)
			.default(0),
		isStream: z.boolean().default(false),
		queueCount: z.number().int().min(0).max(10_000).default(0),
		requesterName: z.string().trim().min(1).max(64).nullable().default(null)
	});
	fastify.post('/v1/image/nowplaying', async (request, reply) => {
		try {
			const body = nowPlayingCardSchema.parse(request.body);
			const buffer = await deduped(`img:nowplaying:${body.trackId}`, () => renderNowPlayingCard(body));
			metrics.request('image-nowplaying');
			return reply.type('image/png').send(buffer);
		} catch (error) {
			return sendError(reply, error);
		}
	});

	// ── 운세 카드 이미지 ──
	// /v1/ohaasa 결과(horoscope 1건)를 그대로 POST하면 돼요 — 봇은 ohaasa.ts에서 추가해요.
	// 캐시 키(날짜+별자리)에서는 운세 본문이 제외돼요 — 하루 12장만 렌더돼요.
	const ohaasaCardSchema = z.object({
		zodiacCode: z.string().regex(/^(0[1-9]|1[0-2])$/),
		rank: z.number().int().min(1).max(12),
		content: z.string().trim().min(1).max(2000),
		lucky: z.string().trim().max(300).default(''),
		date: z.string().trim().max(40).default('')
	});
	fastify.post('/v1/image/ohaasa', async (request, reply) => {
		try {
			const body = ohaasaCardSchema.parse(request.body);
			const buffer = await deduped(`img:ohaasa:${body.date || 'nodate'}:${body.zodiacCode}`, () => renderOhaasaCard(body));
			metrics.request('image-ohaasa');
			return reply.type('image/png').send(buffer);
		} catch (error) {
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
				ttlSeconds: 12 * 3600,
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
