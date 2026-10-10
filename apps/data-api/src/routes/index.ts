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
	memberGreetingPendingKey
} from '@sirubot/utils';
import { fetchLyrics, lyricsCacheKey } from '../providers/lyrics.ts';
import { chaptersCacheKey, fetchYouTubeChaptersFresh } from '../providers/chapters.ts';
import { renderProfileCardPreset } from '../renderers/profileCardPresets.ts';
import { renderGreetingCard, normalizeGreetingBackground } from '../renderers/memberGreetingCard.ts';
import { renderNowPlayingCard } from '../renderers/nowPlayingCard.ts';
import { renderOhaasaCard } from '../renderers/ohaasaCard.ts';
import { deliveryTrackCacheKey, normalizeTrackingNumber, trackDelivery } from '../providers/delivery.ts';
import { fetchOhaasaRaw, getTodayDateString, ohaasaCacheKey } from '../providers/ohaasa.ts';
import { translateDaily } from '../providers/translate.ts';
import { lastGoodDaily, ohaasaStatus, refreshOhaasaNow } from '../services/ohaasaScheduler.ts';
import type { OpenAICompatTranslationProvider } from '../providers/translate.ts';
import { recordPlaybackEvent, recentPlaybackEvents, playbackSnapshot, type PlaybackEventType } from '../services/playbackStore.ts';
import { memoryTidyStatus } from '../services/memoryTidy.ts';
import { getPlayerState, playerHubStatus, subscribeSse } from '../services/playerHub.ts';
import { getBotProfile, botProfileHubStatus } from '../services/botProfileHub.ts';
import { getGreetingTestResult } from '../services/memberGreetingHub.ts';
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
	// 스택/detail은 콘솔 로그에만 남기고 500 응답 본문에는 일반 메시지만 내려요 (내부 정보 유출 방지).
	const stack = error instanceof Error ? error.stack : undefined;
	const detail = error instanceof Error ? error.message : String(error);
	console.error(`[data-api] unhandled route error: ${detail}${stack ? `\n${stack}` : ''}`);
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
	const guildIdParams = z.object({ guildId: z.string().trim().min(1).max(32) });
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

	// ── 봇 프로필 상태 (봇 Redis Pub/Sub → botProfileHub) ──
	// 알 수 없는 길드도 404 대신 profile:null + hub 상태로 응답해요 — dashboard SWR 폴백이 안정적으로 동작하게.
	fastify.get('/v1/bot-profile/:guildId', async (request, reply) => {
		try {
			const { guildId } = guildIdParams.parse(request.params);
			return reply.send({
				profile: getBotProfile(guildId),
				hub: botProfileHubStatus()
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
		userId: z.string().trim().min(1).max(32),
		displayName: z.string().trim().min(1).max(64),
		username: z.string().trim().min(1).max(64),
		avatarUrl: z.string().url().nullable().default(null),
		status: z.enum(['online', 'idle', 'dnd', 'invisible']).default('online'),
		statusLabel: z.string().trim().max(24).default(''),
		intro: z.string().trim().max(120).default(''),
		accountCreated: z.string().trim().max(40).nullable().default(null),
		guildJoinedAt: z.string().trim().max(40).nullable().default(null),
		roleChips: z.array(z.string().trim().min(1).max(32)).max(4).default([]),
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
			const buffer = await deduped(`img:card:${body.userId}`, () =>
				renderProfileCardPreset(body.preset, {
					dark: {
						userId: body.userId,
						profileId: body.username,
						displayName: body.displayName,
						avatarUrl: body.avatarUrl,
						guildTag: body.guildTag,
						guildTagBadgeUrl: body.guildTagBadgeUrl,
						status: body.status,
						onlineLabel: body.statusLabel || statusLabelMap[body.status] || '온라인',
						statusColor: '#3ecf8e',
						intro: body.intro || '느긋하게, 좋아하는 것들과 함께.',
						createdText: dateFmt(body.accountCreated),
						joinedText: dateFmt(body.guildJoinedAt),
						roleChips: body.roleChips,
						topTracks: body.topTracks,
						nowPlaying: body.nowPlaying
					},
					ticket: {
						userId: body.userId,
						profileId: body.username,
						displayName: body.displayName,
						avatarUrl: body.avatarUrl,
						guildTag: body.guildTag,
						guildTagBadgeUrl: body.guildTagBadgeUrl,
						status: body.status,
						onlineLabel: body.statusLabel || statusLabelMap[body.status] || '온라인',
						statusColor: '#2f9e5f',
						intro: body.intro || '느긋하게, 좋아하는 것들과 함께.',
						createdText: dateFmt(body.accountCreated),
						joinedText: dateFmt(body.guildJoinedAt),
						roleChips: body.roleChips,
						topTracks: body.topTracks,
						nowPlaying: body.nowPlaying,
						stats: [
							{ label: '플레이리스트', value: `${body.playlistCount}개`, icon: 'list-music' },
							{ label: '신청한 곡', value: `${body.requestedCount.toLocaleString('ko-KR')}곡`, icon: 'music' }
						]
					}
				})
			);
			metrics.request(`image-profile-${body.preset}`);
			return reply.type('image/png').send(buffer);
		} catch (error) {
			return sendError(reply, error);
		}
	});

	// ── 멤버 인사 카드 이미지 (환영/작별) ──
	// config는 @sirubot/utils 공용 계약 스키마로 검증해요 — bot 리스너·dashboard 에디터와 같은 구조.
	const greetingContextSchema = z.object({
		userId: z.string().trim().min(1).max(32),
		username: z.string().trim().min(1).max(64),
		displayName: z.string().trim().min(1).max(64),
		// 이미지 텍스트의 {서버} 토큰용 — 호출자(봇)가 모르면 빈 문자열로 렌더해요
		guildName: z.string().trim().max(64).nullable().default(null),
		avatarUrl: z.string().url().nullable().default(null),
		memberCount: z.number().int().min(0).max(100_000_000)
	});
	const memberCardSchema = z.object({
		guildId: z.string().trim().min(1).max(32),
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

	// ── 멤버 인사 배경 업로드 정규화 ──
	// 브라우저에서 온 이미지를 저장 규격으로 맞춰요 (JPEG, 가장 긴 변 1600px, 인코딩 후 900KB 이하).
	// dataURI를 Prisma Json 컬럼에 통째로 저장하는 관계로 이것이 저장 비용 상한이에요.
	const greetingBackgroundSchema = z.object({
		dataUri: z
			.string()
			.regex(/^data:image\/(png|jpeg|webp);base64,/, '지원 형식은 PNG·JPEG·WEBP예요.')
			.max(12_000_000)
	});
	fastify.post('/v1/image/member-card/background', { bodyLimit: 8 * 1024 * 1024 }, async (request, reply) => {
		try {
			const body = greetingBackgroundSchema.parse(request.body);
			const dataUri = await normalizeGreetingBackground(body.dataUri);
			metrics.request('image-member-card-background');
			return reply.send({ dataUri });
		} catch (error) {
			if (error instanceof Error && error.name === 'GreetingBackgroundError') {
				const e = error as { identifier?: string };
				return reply.code(400).send({ error: e.identifier ?? 'greeting_error', message: error.message });
			}
			return sendError(reply, error);
		}
	});

	// ── NowPlaying 카드 이미지 ──
	// 카드는 트랙당 1회만 렌더(도미넌트 색 배경 + 제목 + 대기열/볼륨/노드/브랜드 메타).
	// 진행바·신청자는 이미지에 박지 않아요 — 동적 갱신은 봇 텍스트 라인(이모지 프로그레스바) 담당.
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

	// ── 길드 설정 캐시 무효화 (대시보드 저장 후 봇 브로드캐스트) ──
	// 대시보드가 Prisma로 길드 설정을 직접 upsert하므로, 저장 성공 후 호출해 모든 봇 프로세스의
	// GuildService 캐시를 비워요. 봇은 채널(`sirubot:guild-settings:invalidate`)을 구독해 자기
	// 캐시에서 해당 guildId를 지우고 다음 조회 때 DB에서 다시 읽어요.
	const invalidateSchema = z.object({ guildId: z.string().trim().min(1).max(32) });
	fastify.post('/v1/internal/guild-settings/invalidate', async (request, reply) => {
		try {
			const { guildId } = invalidateSchema.parse(request.body);
			const client = sharedCache.getClient();
			if (!client) {
				// Redis 없으면 브로드캐스트 불가 — 실패로 대응해 대시보드가 재시도 가능하게 해요.
				return reply.code(503).send({ error: 'redis_unavailable', message: '무효화 브로드캐스트를 위해 Redis가 필요해요.' });
			}
			await client.publish(GUILD_SETTINGS_INVALIDATE_CHANNEL, JSON.stringify({ guildId }));
			metrics.request('guild-settings-invalidate');
			return reply.send({ ok: true });
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
			guildId: z.string().trim().min(1).max(32),
			// undefined = 변경 없음 / string = 설정 / null = 기본값(사용자명 사용으로 초기화)
			nickname: z.string().max(32).nullable().optional(),
			avatar: z.union([z.string().startsWith('data:image/').max(5_500_000), z.null()]).optional()
		})
		.refine((body) => 'nickname' in body || 'avatar' in body, { message: '변경할 프로필 항목이 없어요.' });
	const BOT_PROFILE_PENDING_TTL_SECONDS = 120;

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

			const client = sharedCache.getClient();
			if (!client) {
				// Redis 없으면 브로드캐스트 불가 — 실패로 대응해 대시보드가 재시도 가능하게 해요.
				return reply.code(503).send({ error: 'redis_unavailable', message: '봇 프로필 적용을 위해 Redis가 필요해요.' });
			}
			await client.set(botProfilePendingKey(guildId), JSON.stringify(payload), { EX: BOT_PROFILE_PENDING_TTL_SECONDS });
			await client.publish(BOT_PROFILE_SET_CHANNEL, JSON.stringify({ guildId }));
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
		guildId: z.string().trim().min(1).max(32),
		kind: z.enum(['welcome', 'goodbye']),
		userId: z.string().trim().min(1).max(32)
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
			await client.set(memberGreetingPendingKey(body.guildId), JSON.stringify({ kind: body.kind, userId: body.userId, requestId }), {
				EX: GREETING_PENDING_TTL_SECONDS
			});
			await client.publish(MEMBER_GREETING_SEND_CHANNEL, JSON.stringify({ guildId: body.guildId, requestId }));
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
