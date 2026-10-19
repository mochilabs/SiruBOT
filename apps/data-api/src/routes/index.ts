import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sharedCache } from '../utils/cache.ts';
import { breaker } from '../utils/breaker.ts';
import { inflightCount } from '../utils/dedup.ts';
import { metrics } from '../utils/metrics.ts';
import { DataApiError, serveCached } from './serveCached.ts';
import { deduped } from '../utils/dedup.ts';
import {
	GUILD_SETTINGS_INVALIDATE_CHANNEL,
	BOT_PROFILE_SET_CHANNEL,
	MEMBER_GREETING_SEND_CHANNEL,
	greetingConfigSchema,
	botProfilePendingKey,
	memberGreetingPendingKey,
	playerWebControlActionSchema,
	playerWebPlayUriSchema,
	redisIdSchema,
	embedFixMetadataRequestSchema,
	swapEmbedFixUrl,
	type EmbedFixResult
} from '@sirubot/utils';
import { resolveRedisSigningKey, wrapRedisMessage } from '@sirubot/utils/redisEnvelope';
import { fetchLyrics, lyricsCacheKey } from '../providers/lyrics.ts';
import { chaptersCacheKey, fetchYouTubeChaptersFresh } from '../providers/chapters.ts';
import { renderProfileCardDark } from '../renderers/profileCardDark.ts';
import { renderProfileCardTicket } from '../renderers/profileCardTicket.ts';
import { renderGreetingCard, normalizeGreetingBackground, normalizeGreetingLayerImage } from '../renderers/memberGreetingCard.ts';
import { renderNowPlayingCard } from '../renderers/nowPlayingCard.ts';
import { renderOhaasaCard } from '../renderers/ohaasaCard.ts';
import { ohaasaCardSchema } from './ohaasaCardSchema.ts';
import { customCommandDraftRequestSchema, generateCustomCommandDraft } from './customCommandDraft.ts';
import { customCommandRefineRequestSchema, generateCustomCommandRefine } from './customCommandRefine.ts';
import { deliveryTrackCacheKey, normalizeTrackingNumber, trackDelivery } from '../providers/delivery.ts';
import { fetchOhaasaRaw, getTodayDateString, ohaasaCacheKey } from '../providers/ohaasa.ts';
import { translateDaily } from '../providers/translate.ts';
import { lastGoodDaily, ohaasaStatus, refreshOhaasaNow } from '../services/ohaasaScheduler.ts';
import type { OpenAICompatTranslationProvider } from '../providers/translate.ts';
import { recordPlaybackEvent, recentPlaybackEvents, playbackSnapshot, type PlaybackEventType } from '../services/playbackStore.ts';
import { memoryTidyStatus } from '../services/memoryTidy.ts';
import { getPlayerState, playerHubStatus, subscribeSse } from '../services/playerHub.ts';
import { getBotProfile, botProfileHubStatus, refreshBotProfile } from '../services/botProfileHub.ts';
import { getGreetingTestResult } from '../services/memberGreetingHub.ts';
import { requestGuildData, guildDataHubStatus, type GuildDataFailureReason } from '../services/guildDataHub.ts';
import { requestPlayerWeb, type PlayerWebResult } from '../services/playerWebHub.ts';
import { requestJtcSetup, type JtcSetupResult } from '../services/jtcSetupHub.ts';
import { registerDashboard } from './dashboard.ts';
import { fetchWeather, weatherCacheKey, type WeatherScope } from '../providers/weather.ts';
import { searchLavalinkYoutube } from '../providers/lavalinkSearch.ts';
import {
	EMBED_FIX_TTL_SECONDS,
	boothEmbedFixResult,
	embedFixCacheKey,
	fetchBoothMeta,
	fetchFxTwitterStatus,
	fetchInstagramImageOk,
	fetchOgMeta,
	instagramEmbedFixResult,
	ogEmbedFixResult,
	xEmbedFixResult
} from '../providers/embedFix.ts';

const LYRICS_TTL_SECONDS = 30 * 24 * 3600;
const WEATHER_TTL_SECONDS = 15 * 60;

/** OG 카드 사이트별 서킷브레이커 프로바이더 이름 — 프로바이더 교체 시 여기만 고쳐요 */
const OG_CARD_PROVIDERS = { tiktok: 'tnktok', reddit: 'vxreddit', pixiv: 'phixiv', threads: 'fixthreads' } as const;

export interface RouteDeps {
	translationProvider: OpenAICompatTranslationProvider;
	/** 커스텀 명령어 초안 생성용 — model만 다르고 같은 OpenAI 호환 엔드포인트를 써요 */
	draftProvider: OpenAICompatTranslationProvider;
	lavalinkRestUrl?: string;
	lavalinkPassword?: string;
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
	// 스택/detail은 콘솔 로그에만 남기고 500 응답 본문에는 일반 메시지만 내려요 (내부 정보 유출 방지).
	const stack = error instanceof Error ? error.stack : undefined;
	const detail = error instanceof Error ? error.message : String(error);
	console.error(`[data-api] unhandled route error: ${detail}${stack ? `\n${stack}` : ''}`);
	return reply.code(500).send({
		error: 'internal_error',
		message: '일시적인 오류예요. 잠시 후 다시 시도해 주세요.'
	});
}

/** 봇 릴레이 실패 사유를 HTTP로 매핑하는 공통부 — redis_unavailable=503, timeout(봇 미응답)=502,
 *  그 외(봇이 실어 보낸 검증 거부·오류)=400. 세 릴레이 흐름(길드 데이터·플레이어 웹·JTC 셋업)이 같은 규칙을 써요. */
function replyBotRelayFailure(
	reply: { code: (n: number) => any },
	reason: 'redis_unavailable' | 'timeout' | 'bot_error',
	rejected: { code: string; message: string | null | undefined; fallback: string }
): any {
	if (reason === 'redis_unavailable') {
		return reply.code(503).send({
			error: 'redis_unavailable',
			message: 'Redis가 연결되어 있지 않아요. 잠시 후 다시 시도해 주세요.'
		});
	}
	if (reason === 'timeout') {
		return reply.code(502).send({
			error: 'bot_timeout',
			message: '봇이 이 서버에 없거나 아직 연결되지 않았어요. 잠시 후 다시 시도해 주세요.'
		});
	}
	return reply.code(400).send({
		error: rejected.code,
		message: rejected.message ?? rejected.fallback
	});
}

/** 길드 데이터 요청 실패 이유를 HTTP 응답으로 매핑해요 — redis_unavailable=503, timeout(봇 미응답)=502.
 *  이 흐름에는 봇 검증 거부(bot_error) 사유가 없어서 공통부의 400 분기는 도달하지 않아요. */
function replyGuildDataFailure(reply: { code: (n: number) => any }, reason: GuildDataFailureReason): any {
	return replyBotRelayFailure(reply, reason, { code: 'guild_data_rejected', message: null, fallback: '' });
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
		playerHub: playerHubStatus(),
		guildDataHub: guildDataHubStatus(),
		memoryTidy: memoryTidyStatus()
	}));

	fastify.get('/v1/youtube/search', async (request, reply) => {
		const parsed = z.object({ query: z.string().trim().min(1).max(200) }).safeParse(request.query);
		if (!parsed.success) return reply.code(400).send({ error: 'invalid_query', message: '검색어는 1~200자까지 입력해 주세요.' });
		if (!deps.lavalinkRestUrl || !deps.lavalinkPassword) {
			return reply.code(503).send({ error: 'lavalink_not_configured', message: 'YouTube 검색이 아직 설정되지 않았어요.' });
		}

		try {
			const tracks = await searchLavalinkYoutube(deps.lavalinkRestUrl, deps.lavalinkPassword, parsed.data.query);
			return { tracks };
		} catch {
			return reply.code(502).send({
				error: 'lavalink_search_failed',
				message: 'YouTube 검색을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.'
			});
		}
	});

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
						} catch (error) {
							// 조용히 원문으로 빠지면 왜 그런지 로그에 남지 않아요 (quota 초과 등)
							console.warn(
								`[data-api] ohaasa translation failed, serving raw: ${error instanceof Error ? error.message : String(error)}`
							);
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

	// ── 임베드 복구 메타데이터 (X·인스타그램·BOOTH·TikTok·Reddit·Pixiv·Threads — 봇 채팅 유틸 리스너가 호출해요) ──
	fastify.post('/v1/embed-fix/metadata', async (request, reply) => {
		try {
			const parsed = embedFixMetadataRequestSchema.parse(request.body);
			const results: EmbedFixResult[] = [];
			for (const link of parsed.links) {
				if (link.site === 'x') {
					const { data: status } = await serveCached({
						route: 'embed-fix',
						key: embedFixCacheKey('x', link.url),
						ttlSeconds: EMBED_FIX_TTL_SECONDS,
						provider: 'fxtwitter',
						fetchFresh: () => fetchFxTwitterStatus(link.url)
					});
					results.push(xEmbedFixResult(link, status));
				} else if (link.site === 'instagram') {
					// kkinstagram 고친 주소로 실제 이미지가 이어지는지만 확인해요 (메타는 안 와요)
					const { data: imageOk } = await serveCached({
						route: 'embed-fix',
						key: embedFixCacheKey('instagram', link.url),
						ttlSeconds: EMBED_FIX_TTL_SECONDS,
						provider: 'kkinstagram',
						fetchFresh: () => fetchInstagramImageOk(link.fixedUrl ?? link.url)
					});
					results.push(instagramEmbedFixResult(link, imageOk));
				} else if (link.site === 'booth') {
					const { data: meta } = await serveCached({
						route: 'embed-fix',
						key: embedFixCacheKey('booth', link.url),
						ttlSeconds: EMBED_FIX_TTL_SECONDS,
						provider: 'booth',
						fetchFresh: () => fetchBoothMeta(link.url)
					});
					results.push(boothEmbedFixResult(link, meta));
				} else {
					// OG 카드 사이트(TikTok·Reddit·Pixiv·Threads) — 고친 주소에서 og 메타를 읽어 카드를 만들어요
					const provider = OG_CARD_PROVIDERS[link.site];
					const swappedUrl = swapEmbedFixUrl(link.site, link.url);
					const { data: meta } = await serveCached({
						route: 'embed-fix',
						key: embedFixCacheKey(link.site, link.url),
						ttlSeconds: EMBED_FIX_TTL_SECONDS,
						provider,
						fetchFresh: () => fetchOgMeta(swappedUrl ?? link.url)
					});
					results.push(ogEmbedFixResult(link, meta, swappedUrl));
				}
			}
			return reply.send({ results });
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
	const guildIdParams = z.object({ guildId: redisIdSchema });
	const playbackEventSchema = z.object({
		type: z.enum(['track_start', 'track_end', 'track_stuck', 'track_error', 'queue_end', 'playback_abort', 'node_disconnect', 'node_error']),
		// 노드 이벤트는 길드가 아니라 음성 서버 단위라 guildId가 없어요. nodeId로 식별해요.
		guildId: redisIdSchema.nullable().default(null),
		nodeId: z.string().max(100).nullable().default(null),
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

	// ── 라이브 플레이어 상태 (봇 Redis Pub/Sub → playerHub) ──
	// 알 수 없는 길드/전송 중지 길드도 404 대신 player:null + hub 상태로 응답해요 — dashboard SWR 폴백이 안정적으로 동작하게.
	fastify.get('/v1/player/:guildId', async (request, reply) => {
		try {
			const { guildId } = guildIdParams.parse(request.params);
			return reply.send({
				player: getPlayerState(guildId),
				hub: playerHubStatus()
			});
		} catch (error) {
			return sendError(reply, error);
		}
	});

	// ── 봇 프로필 상태 (화면 조회 시 봇에 최신 상태를 요청하고 캐시를 폴백으로 사용) ──
	fastify.get('/v1/bot-profile/:guildId', async (request, reply) => {
		try {
			const { guildId } = guildIdParams.parse(request.params);
			const refreshed = await refreshBotProfile(guildId);
			return reply.send({
				profile: getBotProfile(guildId),
				hub: botProfileHubStatus(),
				refreshFailed: !refreshed
			});
		} catch (error) {
			return sendError(reply, error);
		}
	});

	// ── 라이브 플레이어 상태 SSE — Redis Pub/Sub 구독을 즉시 relay해요 ──
	fastify.get('/v1/player/:guildId/stream', async (request, reply) => {
		const { guildId = '' } = guildIdParams.parse(request.params);
		// SSE는 응답 수명을 직접 관리하므로 Fastify 라이프사이클(타임아웃/자동 종료)에서 분리해요.
		reply.hijack();
		const raw = reply.raw;
		raw.writeHead(200, {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache, no-transform',
			connection: 'keep-alive',
			'x-accel-buffering': 'no'
		});
		raw.write('retry: 3000\n\n');

		const send = (payload: string): void => {
			raw.write(`event: state\ndata: ${payload}\n\n`);
		};

		// 현재 상태 1회 즉시 전송 (없으면 player:null)
		send(JSON.stringify({ player: getPlayerState(guildId), hub: playerHubStatus() }));

		const unsubscribe = subscribeSse(guildId, send);
		// 킵얼라이브 — 프록시/방화벽 타임아웃 방지
		const keepalive = setInterval(() => {
			try {
				raw.write(': keepalive\n\n');
			} catch {
				// noop
			}
		}, 15_000);

		raw.once('close', () => {
			clearInterval(keepalive);
			unsubscribe();
		});
	});

	// ── 택배 조회 ──
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

	// ── 프로필 카드 이미지 (프리셋: dark=RINE 다크 퍼플 / ticket=RINE 멤버패스 티켓) ──
	const topTracksSchema = z
		.array(
			z.object({
				title: z.string().trim().max(120),
				artist: z.string().trim().max(120),
				thumbnailUrl: z.string().url().nullable().default(null)
			})
		)
		.max(3)
		.default([]);
	const nowPlayingSchema = z
		.object({
			title: z.string().trim().min(1).max(200),
			artist: z.string().trim().max(120).default(''),
			thumbnailUrl: z.string().url().nullable().default(null)
		})
		.nullable()
		.default(null);
	const profileCardSchema = z.object({
		preset: z.enum(['dark', 'ticket']).default('dark'),
		userId: redisIdSchema,
		displayName: z.string().trim().min(1).max(64),
		username: z.string().trim().min(1).max(64),
		avatarUrl: z.string().url().nullable().default(null),
		status: z.enum(['online', 'idle', 'dnd', 'invisible']).default('online'),
		statusLabel: z.string().trim().max(24).default(''),
		intro: z.string().trim().max(120).default(''),
		accountCreated: z.string().trim().max(40).nullable().default(null),
		guildJoinedAt: z.string().trim().max(40).nullable().default(null),
		roleChips: z.array(redisIdSchema).max(4).default([]),
		guildTag: z
			.string()
			.trim()
			.min(1)
			.max(8)
			.regex(/^[A-Za-z0-9]+$/, '영문/숫자 4자리 태그만 지원해요')
			.nullable()
			.default(null),
		guildTagBadgeUrl: z.string().url().nullable().default(null),
		playlistCount: z.number().int().min(0).max(1000).default(0),
		requestedCount: z.number().int().min(0).max(10_000_000).default(0),
		topTracks: topTracksSchema,
		nowPlaying: nowPlayingSchema
	});
	fastify.post('/v1/image/profile', async (request, reply) => {
		try {
			const body = profileCardSchema.parse(request.body);
			const dateFmt = (iso: string | null): string => {
				if (!iso) return '';
				const d = new Date(iso);
				if (Number.isNaN(d.getTime())) return '';
				return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, '0')}. ${String(d.getDate()).padStart(2, '0')}`;
			};
			const statusLabelMap: Record<string, string> = { online: '온라인', idle: '자리 비움', dnd: '방해 금지', invisible: '오프라인' };
			const buffer = await deduped(`img:card:${body.userId}`, () => {
				// dark/ticket 공통 필드 — 선택된 프리셋 입력만 조립해요.
				const base = {
					userId: body.userId,
					profileId: body.username,
					displayName: body.displayName,
					avatarUrl: body.avatarUrl,
					guildTag: body.guildTag,
					guildTagBadgeUrl: body.guildTagBadgeUrl,
					status: body.status,
					onlineLabel: body.statusLabel || statusLabelMap[body.status] || '온라인',
					// 소개는 유저가 등록한 문구 그대로 쓰고, 비어 있으면 렌더러가 소개 칸을 생략해요
					intro: body.intro,
					createdText: dateFmt(body.accountCreated),
					joinedText: dateFmt(body.guildJoinedAt),
					roleChips: body.roleChips,
					topTracks: body.topTracks,
					nowPlaying: body.nowPlaying
				};
				if (body.preset === 'dark') {
					return renderProfileCardDark({ ...base, statusColor: '#3ecf8e' });
				}
				return renderProfileCardTicket({
					...base,
					statusColor: '#2f9e5f',
					stats: [
						{ label: '플레이리스트', value: `${body.playlistCount}개`, icon: 'list-music' },
						{ label: '신청한 곡', value: `${body.requestedCount.toLocaleString('ko-KR')}곡`, icon: 'music' }
					]
				});
			});
			metrics.request(`image-profile-${body.preset}`);
			return reply.type('image/png').send(buffer);
		} catch (error) {
			return sendError(reply, error);
		}
	});

	// ── 멤버 인사 카드 이미지 (환영/작별) ──
	// config는 @sirubot/utils 공용 계약 스키마로 검증해요 — bot 리스너·dashboard 에디터와 같은 구조.
	const greetingContextSchema = z.object({
		userId: redisIdSchema,
		username: z.string().trim().min(1).max(64),
		displayName: z.string().trim().min(1).max(64),
		// 이미지 텍스트의 {서버} 토큰용 — 호출자(봇)가 모르면 빈 문자열로 렌더해요
		guildName: z.string().trim().max(64).nullable().default(null),
		avatarUrl: z.string().url().nullable().default(null),
		memberCount: z.number().int().min(0).max(100_000_000)
	});
	const memberCardSchema = z.object({
		guildId: redisIdSchema,
		kind: z.enum(['welcome', 'goodbye']),
		config: greetingConfigSchema,
		context: greetingContextSchema
	});
	fastify.post('/v1/image/member-card', { bodyLimit: 4 * 1024 * 1024 }, async (request, reply) => {
		try {
			const body = memberCardSchema.parse(request.body);
			const image = body.config.image;
			if (!image) {
				// 계약상 useImage:false 설정은 image:null — 이미지 경로는 렌더할 배경이 없어요
				throw new DataApiError(400, 'greeting_image_missing', '이미지 설정이 비어 있어요 — useImage를 켜고 배경을 지정해 주세요.');
			}
			const buffer = await deduped(`img:greeting:${body.guildId}:${body.kind}:${body.context.userId}`, () =>
				renderGreetingCard(image, {
					userId: body.context.userId,
					displayName: body.context.displayName,
					guildName: body.context.guildName ?? '',
					memberCount: body.context.memberCount,
					avatarUrl: body.context.avatarUrl
				})
			);
			metrics.request(`image-member-card-${body.kind}`);
			return reply.type('image/png').send(buffer);
		} catch (error) {
			return sendError(reply, error);
		}
	});

	// ── 멤버 인사 배경/레이어 업로드 정규화 ──
	// 브라우저에서 온 이미지를 저장 규격으로 맞춰요. 배경은 JPEG(가장 긴 변 1600px, 인코딩 후 900KB 이하),
	// 스티커/로고 레이어는 알파를 살려야 해서 PNG로 정규화해요.
	// dataURI를 Prisma Json 컬럼에 통째로 저장하는 관계로 이것이 저장 비용 상한이에요.
	const greetingBackgroundSchema = z.object({
		dataUri: z
			.string()
			.regex(/^data:image\/(png|jpeg|webp);base64,/, '지원 형식은 PNG·JPEG·WEBP예요.')
			.max(12_000_000)
	});
	const registerGreetingImageNormalizeRoute = (path: string, metric: string, normalize: (dataUri: string) => Promise<string>) => {
		fastify.post(path, { bodyLimit: 8 * 1024 * 1024 }, async (request, reply) => {
			try {
				const body = greetingBackgroundSchema.parse(request.body);
				const dataUri = await normalize(body.dataUri);
				metrics.request(metric);
				return reply.send({ dataUri });
			} catch (error) {
				if (error instanceof Error && error.name === 'GreetingBackgroundError') {
					const e = error as { identifier?: string };
					return reply.code(400).send({ error: e.identifier ?? 'greeting_error', message: error.message });
				}
				return sendError(reply, error);
			}
		});
	};
	registerGreetingImageNormalizeRoute('/v1/image/member-card/background', 'image-member-card-background', normalizeGreetingBackground);
	registerGreetingImageNormalizeRoute('/v1/image/member-card/layer-image', 'image-member-card-layer-image', normalizeGreetingLayerImage);

	// ── NowPlaying 카드 이미지 ──
	// 카드는 트랙 식별자 + 볼륨/챕터 + 5초 위치 버킷마다 다시 렌더돼요
	// (도미넌트 색 배경 + 제목 + 다음 곡 목록 + 대기열/볼륨/반복/노드/브랜드 메타).
	// 신청자·추천/일시정지 뱃지도 이미지에 박아요 — 텍스트 동적 라인은 봇이 담당.
	const nowPlayingCardSchema = z.object({
		trackId: z.string().trim().min(1).max(200),
		title: z.string().trim().min(1).max(200),
		artist: z.string().trim().max(200).default(''),
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
		isPaused: z.boolean().default(false),
		repeatMode: z.enum(['off', 'track', 'queue']).default('off'),
		isRecommended: z.boolean().default(false),
		nextTracks: z
			.array(
				z.object({
					title: z.string().trim().min(1).max(200),
					artist: z.string().trim().max(200).nullable().default(null)
				})
			)
			.max(3)
			.default([]),
		queueCount: z.number().int().min(0).max(10_000).default(0),
		queueRemainingMs: z
			.number()
			.int()
			.min(0)
			.max(24 * 3600_000)
			.default(0),
		volume: z.number().int().min(0).max(1000).nullable().default(null),
		nodeId: z.string().trim().min(1).max(100).nullable().default(null),
		brandLine: z.string().trim().min(1).max(120).nullable().default(null),
		chapter: z
			.object({
				name: z.string().trim().min(1).max(120),
				startMs: z
					.number()
					.int()
					.min(0)
					.max(24 * 3600_000),
				endMs: z
					.number()
					.int()
					.min(0)
					.max(24 * 3600_000)
			})
			.nullable()
			.default(null),
		requester: z
			.object({
				name: z.string().trim().min(1).max(64),
				avatarUrl: z.string().url().nullable().default(null)
			})
			.nullable()
			.default(null),
		trackUrl: z.string().url().nullable().default(null)
	});
	fastify.post('/v1/image/nowplaying', async (request, reply) => {
		try {
			const body = nowPlayingCardSchema.parse(request.body);
			// 위치 버킷을 키에 넣어 같은 트랙, 다른 진행율의 동시 요청이 첫 응답으로 합쳐지지 않게 한다.
			const positionBucket = Math.floor(body.positionMs / 5000);
			const buffer = await deduped(`img:nowplaying:${body.trackId}:p${positionBucket}`, () => renderNowPlayingCard(body));
			metrics.request('image-nowplaying');
			return reply.type('image/png').send(buffer);
		} catch (error) {
			return sendError(reply, error);
		}
	});

	// ── 운세 카드 이미지 ──
	// 봇이 /v1/ohaasa 1건에서 요약 필드만 골라 POST해요 — 카드는 별자리·순위·럭키만 그려요.
	// 운세 설명·럭키 컬러는 카드에 넣지 않아요(텍스트 본문 전용) — 스키마에 필드 자체가 없어요.
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

	// ── 길드 설정 캐시 무효화 (대시보드 저장 후 봇 브로드캐스트) ──
	// 대시보드가 Prisma로 길드 설정을 직접 upsert하므로, 저장 성공 후 호출해 모든 봇 프로세스의
	// GuildService 캐시를 비워요. 봇은 채널(`sirubot:guild-settings:invalidate`)을 구독해 자기
	// 캐시에서 해당 guildId를 지우고 다음 조회 때 DB에서 다시 읽어요.
	// reason이 'mixer'면 봇이 재생 중인 플레이어에 갭리스·크로스페이드 설정을 바로 밀어 넣어요.
	const invalidateSchema = z.object({
		guildId: redisIdSchema,
		reason: z.enum(['mixer']).optional()
	});
	fastify.post('/v1/internal/guild-settings/invalidate', async (request, reply) => {
		try {
			const { guildId, reason } = invalidateSchema.parse(request.body);
			const client = sharedCache.getClient();
			if (!client) {
				// Redis 없으면 브로드캐스트 불가 — 실패로 대응해 대시보드가 재시도 가능하게 해요.
				return reply.code(503).send({ error: 'redis_unavailable', message: '무효화 브로드캐스트를 위해 Redis가 필요해요.' });
			}
			await client.publish(GUILD_SETTINGS_INVALIDATE_CHANNEL, JSON.stringify(reason ? { guildId, reason } : { guildId }));
			metrics.request('guild-settings-invalidate');
			return reply.send({ ok: true });
		} catch (error) {
			return sendError(reply, error);
		}
	});

	// ── 커스텀 명령어 AI 초안 (대시보드 빌더: 자연어 설명 → JSON 스펙 초안) ──
	// LLM 출력은 라우트 모듈에서 파싱+스키마 재검증(1회 재시도)을 거쳐요. 생성기 미설정이면
	// 503으로 안내해 대시보드가 그대로 보여줘요.
	const draftRequestSchema = customCommandDraftRequestSchema;
	fastify.post('/v1/ai/custom-command-draft', async (request, reply) => {
		try {
			const { prompt } = draftRequestSchema.parse(request.body);
			if (!deps.draftProvider.available) {
				return reply.code(503).send({
					error: 'draft_unavailable',
					message: 'AI 초안 생성기가 설정되지 않았어요. 봇 관리자에게 OPENAI_API_KEY 설정을 문의해 주세요.'
				});
			}
			const result = await generateCustomCommandDraft(deps.draftProvider, prompt);
			if (!result.ok) {
				console.warn(`[data-api] custom command draft failed: ${result.reason}`);
				return reply.code(502).send({ error: 'draft_failed', message: 'AI 초안 생성에 실패했어요. 잠시 후 다시 시도해 주세요.' });
			}
			metrics.request('custom-command-draft');
			return reply.send(result.draft);
		} catch (error) {
			return sendError(reply, error);
		}
	});

	// 커스텀 명령어 AI 반복 수정 — 현재 스펙 + 수정 지시(+최근 대화 기억)를 받아 지시된 부분만 바꾼
	// 전체 스펙을 돌려줘요. 초안과 같은 provider·검증 루프를 써요.
	const refineRequestSchema = customCommandRefineRequestSchema;
	fastify.post('/v1/ai/custom-command-refine', async (request, reply) => {
		try {
			const refineRequest = refineRequestSchema.parse(request.body);
			if (!deps.draftProvider.available) {
				return reply.code(503).send({
					error: 'draft_unavailable',
					message: 'AI 수정 기능이 설정되지 않았어요. 봇 관리자에게 OPENAI_API_KEY 설정을 문의해 주세요.'
				});
			}
			const result = await generateCustomCommandRefine(deps.draftProvider, refineRequest);
			if (!result.ok) {
				console.warn(`[data-api] custom command refine failed: ${result.reason}`);
				return reply.code(502).send({ error: 'refine_failed', message: 'AI 수정에 실패했어요. 잠시 후 다시 시도해 주세요.' });
			}
			metrics.request('custom-command-refine');
			return reply.send({ spec: result.spec });
		} catch (error) {
			return sendError(reply, error);
		}
	});

	// ── 웹 플레이어 request/reply (대시보드 검색·재생·제어·음성 상태 → 봇 → 응답 상관) ──
	// 요청자의 음성 채널과 관리자/DJ 권한은 봇 캐시로만 해석할 수 있으므로 userId까지 전달해요.
	// REQUEST 채널로 퍼블리시한 뒤 kind별 대기 시간(playerWebHub KIND_TIMEOUT_MS) 안에 RESPONSE 채널 응답을
	// 상관해 내려줘요. Redis 없으면 503, 봇이 시간 안에 응답하지 않으면(봇 미보유·미연결 포함) 502,
	// 봇이 검증 실패 사유(음성 미접속·권한 없음·노드 없음 등)를 실어 보내면 400으로 그 문구를 그대로 전달해요.
	const playerUserIdSchema = redisIdSchema.regex(/^\d+$/, 'userId는 Discord 유저 ID 형식이어야 해요.');
	const playerWebSearchSchema = z.object({
		guildId: redisIdSchema,
		userId: playerUserIdSchema,
		query: z.string().trim().min(1).max(200)
	});
	const playerWebPlaySchema = z.object({
		guildId: redisIdSchema,
		userId: playerUserIdSchema,
		// http/https 전용 — 다른 스킴은 Lavalink 측 내부 fetch(SSRF)로 이어질 수 있어 공용 계약 스키마로 막아요.
		uri: playerWebPlayUriSchema
	});
	const playerWebControlSchema = z.object({
		guildId: redisIdSchema,
		userId: playerUserIdSchema,
		action: playerWebControlActionSchema,
		value: z.number().int().min(0).max(150).optional()
	});
	const playerVoiceContextQuery = z.object({ userId: playerUserIdSchema });

	/** PlayerWebResult를 HTTP로 매핑 — 성공은 필드를 그대로, 실패는 공통부(replyBotRelayFailure)로 내려줘요 */
	function replyPlayerWebResult(reply: { code: (n: number) => any; send: (body: unknown) => any }, result: PlayerWebResult): any {
		if (result.ok) {
			return reply.send({ ok: true, tracks: result.tracks ?? null, voice: result.voice ?? null });
		}
		// 봇이 검증 실패(음성 미접속·권한 없음 등)를 실어 보낸 경우 — 사용자가 고칠 수 있는 행동이므로 400
		return replyBotRelayFailure(reply, result.reason, {
			code: 'web_player_rejected',
			message: result.message,
			fallback: '요청을 처리하지 못했어요.'
		});
	}

	fastify.post('/v1/internal/player/search', async (request, reply) => {
		try {
			const { guildId, userId, query } = playerWebSearchSchema.parse(request.body);
			const result = await requestPlayerWeb({
				requestId: crypto.randomUUID(),
				guildId,
				userId,
				kind: 'search',
				query
			});
			metrics.request('player-web-search');
			return replyPlayerWebResult(reply, result);
		} catch (error) {
			return sendError(reply, error);
		}
	});

	fastify.post('/v1/internal/player/play', async (request, reply) => {
		try {
			const { guildId, userId, uri } = playerWebPlaySchema.parse(request.body);
			const result = await requestPlayerWeb({
				requestId: crypto.randomUUID(),
				guildId,
				userId,
				kind: 'play',
				uri
			});
			metrics.request('player-web-play');
			return replyPlayerWebResult(reply, result);
		} catch (error) {
			return sendError(reply, error);
		}
	});

	fastify.post('/v1/internal/player/control', async (request, reply) => {
		try {
			const { guildId, userId, action, value } = playerWebControlSchema.parse(request.body);
			const result = await requestPlayerWeb({
				requestId: crypto.randomUUID(),
				guildId,
				userId,
				kind: 'control',
				action,
				...(value !== undefined ? { value } : {})
			});
			metrics.request('player-web-control');
			return replyPlayerWebResult(reply, result);
		} catch (error) {
			return sendError(reply, error);
		}
	});

	// ── 요청자 음성·권한 상태 조회 (player 페이지 배지) ──
	fastify.get('/v1/player/:guildId/voice-context', async (request, reply) => {
		try {
			const { guildId } = guildIdParams.parse(request.params);
			const { userId } = playerVoiceContextQuery.parse(request.query);
			const result = await requestPlayerWeb({
				requestId: crypto.randomUUID(),
				guildId,
				userId,
				kind: 'voice-context'
			});
			metrics.request('player-web-voice-context');
			return replyPlayerWebResult(reply, result);
		} catch (error) {
			return sendError(reply, error);
		}
	});

	// ── JTC 마커 채널 셋업 (대시보드 설정 → 봇 tempVoiceService 수행) ──
	// 마커 채널 생성·이동은 봇 토큰으로만 가능해요 (유저 OAuth 토큰에는 길드 채널 관리 권한이 없어요).
	// 봇이 tempVoiceService.setupMarkerChannel로 카테고리 검증 → 마커 재사용(이동)·생성 → DB 저장까지
	// 수행하고 응답해요. Redis 없으면 503, 봇이 응답하지 않으면 502, 봇이 검증 실패 사유를 실어 보내면 400.
	const jtcSetupRequestBody = z.object({
		guildId: redisIdSchema,
		userId: playerUserIdSchema,
		categoryId: redisIdSchema
	});

	/** JtcSetupResult를 HTTP로 매핑 — 성공은 markerChannelId, 실패는 공통부(replyBotRelayFailure)로 내려줘요 */
	function replyJtcSetupResult(reply: { code: (n: number) => any; send: (body: unknown) => any }, result: JtcSetupResult): any {
		if (result.ok) {
			return reply.send({ ok: true, markerChannelId: result.markerChannelId ?? null });
		}
		// 봇이 검증 실패(카테고리 아님·권한 부족 등)를 실어 보낸 경우 — 사용자가 고칠 수 있는 행동이므로 400
		return replyBotRelayFailure(reply, result.reason, {
			code: 'jtc_setup_rejected',
			message: result.message,
			fallback: '임시 방 마커 채널을 준비하지 못했어요.'
		});
	}

	fastify.post('/v1/internal/jtc/setup', async (request, reply) => {
		try {
			const { guildId, userId, categoryId } = jtcSetupRequestBody.parse(request.body);
			const result = await requestJtcSetup({
				requestId: crypto.randomUUID(),
				guildId,
				userId,
				categoryId
			});
			metrics.request('jtc-setup');
			return replyJtcSetupResult(reply, result);
		} catch (error) {
			return sendError(reply, error);
		}
	});

	// ── 봇 프로필(닉네임·아바타) 적용 요청 (대시보드 저장 후 봇 적용) ──
	// 아바타는 data URI로 온다(3MiB 파일 → base64 ~4.2MB). Fastify 기본 bodyLimit(1MiB)을 넘으므로
	// 이 라우트만 8MiB로 올려요. 본문은 Redis pending 키에 기록하고 set 채널로 guildId만 브로드캐스트해요 —
	// 큰 본문이 레플리카 수만큼 복제되지 않아요. 봇은 소유 길드만 읽고 즉시 지워요 (TTL 120초).
	const botProfileSetSchema = z
		.object({
			guildId: redisIdSchema,
			// undefined = 변경 없음 / string = 설정 / null = 기본값(사용자명 사용으로 초기화)
			nickname: z.string().max(32).nullable().optional(),
			avatar: z.union([z.string().startsWith('data:image/').max(5_500_000), z.null()]).optional(),
			banner: z.union([z.string().startsWith('data:image/').max(5_500_000), z.null()]).optional()
		})
		.refine((body) => 'nickname' in body || 'avatar' in body || 'banner' in body, { message: '변경할 프로필 항목이 없어요.' });
	const BOT_PROFILE_PENDING_TTL_SECONDS = 120;

	// Redis 메시지 서명 키 — REDIS_AUTH_KEY ?? AUTH_KEY (봇과 공유). pending 값·트리거 메시지 모두 서명해요 (SEC-006).
	const redisSigningKey = resolveRedisSigningKey(process.env);

	fastify.post('/v1/internal/bot-profile/set', { bodyLimit: 8 * 1024 * 1024 }, async (request, reply) => {
		try {
			const body = botProfileSetSchema.parse(request.body);
			const guildId = body.guildId;
			const payload: Record<string, string | null> = {};
			if ('nickname' in body && body.nickname !== undefined) {
				const nickname = body.nickname === null ? null : body.nickname.trim();
				payload.nickname = nickname !== null && nickname.length > 0 ? nickname : null;
			}
			if ('avatar' in body && body.avatar !== undefined) {
				payload.avatar = body.avatar;
			}
			if ('banner' in body && body.banner !== undefined) {
				payload.banner = body.banner;
			}

			const client = sharedCache.getClient();
			if (!client) {
				// Redis 없으면 브로드캐스트 불가 — 실패로 대응해 대시보드가 재시도 가능하게 해요.
				return reply.code(503).send({ error: 'redis_unavailable', message: '봇 프로필 적용을 위해 Redis가 필요해요.' });
			}
			await client.set(botProfilePendingKey(guildId), wrapRedisMessage(redisSigningKey, payload), { EX: BOT_PROFILE_PENDING_TTL_SECONDS });
			await client.publish(BOT_PROFILE_SET_CHANNEL, wrapRedisMessage(redisSigningKey, { guildId }));
			metrics.request('bot-profile-set');
			return reply.send({ ok: true });
		} catch (error) {
			return sendError(reply, error);
		}
	});

	// ── 멤버 인사 테스트 전송 (대시보드 → 봇) ──
	// bot-profile set과 같은 pending 키 + 브로드캐스트 패턴이에요. 본문({kind, userId, requestId})은
	// pending 키에 기록해 소유 봇 프로세스만 읽게 하고, 채널로는 guildId·requestId만 실어요.
	// 봇은 실제 멤버 정보로 카드를 렌더·전송하고 결과를 state 채널(memberGreetingStateChannel)로 알려요.
	const greetingSendSchema = z.object({
		guildId: redisIdSchema,
		kind: z.enum(['welcome', 'goodbye']),
		userId: redisIdSchema
	});
	const GREETING_PENDING_TTL_SECONDS = 120;

	fastify.post('/v1/internal/greeting/send', async (request, reply) => {
		try {
			const body = greetingSendSchema.parse(request.body);
			const client = sharedCache.getClient();
			if (!client) {
				// Redis 없으면 브로드캐스트 불가 — 실패로 대응해 대시보드가 재시도 가능하게 해요.
				return reply.code(503).send({ error: 'redis_unavailable', message: '인사 테스트 전송을 위해 Redis가 필요해요.' });
			}
			const requestId = crypto.randomUUID();
			await client.set(
				memberGreetingPendingKey(body.guildId),
				wrapRedisMessage(redisSigningKey, { kind: body.kind, userId: body.userId, requestId }),
				{
					EX: GREETING_PENDING_TTL_SECONDS
				}
			);
			await client.publish(MEMBER_GREETING_SEND_CHANNEL, wrapRedisMessage(redisSigningKey, { guildId: body.guildId, requestId }));
			metrics.request('greeting-send');
			return reply.send({ ok: true, requestId });
		} catch (error) {
			return sendError(reply, error);
		}
	});

	// ── 멤버 인사 테스트 전송 결과 (대시보드 폴링 — bot-profile 상태 엔드포인트와 같은 패턴) ──
	fastify.get('/v1/greeting/state/:guildId', async (request, reply) => {
		try {
			const { guildId } = guildIdParams.parse(request.params);
			return reply.send(getGreetingTestResult(guildId));
		} catch (error) {
			return sendError(reply, error);
		}
	});

	// ── 길드 데이터 (대시보드 → Redis request → 봇 캐시 → requestId 상관 응답) ──
	// 대시보드는 사용자 토큰으로 Discord API를 직접 호출하면 401이 나서 봇 권한으로 우회해요.
	// data-api가 request 채널(sirubot:guild-data:request)로 요청을 퍼블리시하면 해당 길드를 보유한
	// 봇 프로세스가 자기 캐시에서 목록을 응답 채널(sirubot:guild-data:response)로 돌려주고,
	// guildDataHub가 requestId로 요청과 응답을 상관해 내려줘요. Redis가 없으면 503,
	// 봇이 3초 안에 응답하지 않으면(봇 미보유·미연결 포함) 502로 실패해요.
	fastify.get('/v1/guilds/:guildId/channels', async (request, reply) => {
		try {
			const { guildId } = guildIdParams.parse(request.params);
			const result = await requestGuildData(guildId, 'channels');
			if (!result.ok) return replyGuildDataFailure(reply, result.reason);
			metrics.request('guild-data-channels');
			return reply.send({ channels: result.channels ?? [] });
		} catch (error) {
			return sendError(reply, error);
		}
	});

	fastify.get('/v1/guilds/:guildId/roles', async (request, reply) => {
		try {
			const { guildId } = guildIdParams.parse(request.params);
			const result = await requestGuildData(guildId, 'roles');
			if (!result.ok) return replyGuildDataFailure(reply, result.reason);
			metrics.request('guild-data-roles');
			return reply.send({ roles: result.roles ?? [] });
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
