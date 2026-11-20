import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { greetingConfigSchema, redisIdSchema } from '@sirubot/utils';
import { deduped } from '../utils/dedup.ts';
import { getLogger } from '../utils/logger.ts';
import { metrics } from '../utils/metrics.ts';
import { DataApiError } from './serveCached.ts';
import { playerUserIdSchema, sendDomainError, sendError } from './common.ts';
import { renderProfileCardDark } from '../renderers/profileCardDark.ts';
import { renderProfileCardSatori } from '../renderers/satori/profileCard.ts';
import { renderProfileCardTicket } from '../renderers/profileCardTicket.ts';
import { renderGreetingCard, normalizeGreetingBackground, normalizeGreetingLayerImage } from '../renderers/memberGreetingCard.ts';
import { renderNowPlayingCard } from '../renderers/nowPlayingCard.ts';
import { renderNowPlayingCardSatori } from '../renderers/satori/nowPlayingCard.ts';
import { renderOhaasaCard, renderOhaasaTopCard } from '../renderers/ohaasaCard.ts';
import { ohaasaCardSchema, ohaasaTopCardSchema } from './ohaasaCardSchema.ts';
import { renderWeatherCard } from '../renderers/weatherCard.ts';
import { weatherCardSchema } from './weatherCardSchema.ts';
import { renderWrappedCard } from '../renderers/satori/wrappedCard.ts';
import { getDb } from '../services/db.ts';
import { loadWrappedStats, resolveWrappedRange } from '../services/wrapped.ts';

const logger = getLogger('render');

/** 이미지 렌더 라우트 — 프로필 카드(dark/ticket)·멤버 인사 카드·NowPlaying·운세 카드·날씨 카드 + 인사 이미지 정규화. 렌더러 본체는 renderers/에 있어요. */

/** dedup 키용 페이로드 해시 — 같은 유저의 다른 요청(preset·설정·배경 변경)이 첫 렌더를 공유하지 않게 키에 섞어 넣어요 */
function payloadHash(payload: unknown): string {
	return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
}

export function registerRenderRoutes(fastify: FastifyInstance): void {
	// 프로필 카드 이미지 (프리셋: dark=RINE 다크 퍼플 / ticket=RINE 멤버패스 티켓)
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
		preset: z.enum(['dark', 'ticket', 'dashboard', 'light', 'aura']).default('dark'),
		bannerUrl: z.string().url().nullable().default(null),
		listenText: z.string().trim().max(40).default(''),
		checkinStreak: z.number().int().min(0).max(100_000).nullable().default(null),
		userId: redisIdSchema,
		displayName: z.string().trim().min(1).max(64),
		username: z.string().trim().min(1).max(64),
		avatarUrl: z.string().url().nullable().default(null),
		status: z.enum(['online', 'idle', 'dnd', 'invisible']).default('online'),
		statusLabel: z.string().trim().max(24).default(''),
		intro: z.string().trim().max(120).default(''),
		accountCreated: z.string().trim().max(40).nullable().default(null),
		guildJoinedAt: z.string().trim().max(40).nullable().default(null),
		// 역할 이름이라 ID 정규식을 쓰면 한글·공백 이름이 400이 돼요 — 디스코드 역할명 상한(100자)만 둬요.
		roleChips: z.array(z.string().trim().min(1).max(100)).max(4).default([]),
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
			// 키에 페이로드 해시를 넣어요 — 다른 preset·입력의 동시 요청이 첫 렌더 이미지를 공유하지 않게.
			const buffer = await deduped(`img:card:${body.userId}:${payloadHash(body)}`, () => {
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
				if (body.preset === 'dashboard' || body.preset === 'light' || body.preset === 'aura') {
					const variant = body.preset;
					return renderProfileCardSatori({
						variant,
						displayName: base.displayName,
						username: base.profileId,
						avatarUrl: base.avatarUrl,
						bannerUrl: body.bannerUrl,
						guildTag: base.guildTag,
						status: base.status,
						statusLabel: base.onlineLabel,
						intro: base.intro,
						createdText: base.createdText,
						joinedText: base.joinedText,
						roleChips: base.roleChips,
						playlistCount: body.playlistCount,
						requestedCount: body.requestedCount,
						listenText: body.listenText,
						checkinStreak: body.checkinStreak,
						topTracks: base.topTracks,
						nowPlaying: base.nowPlaying
					}).catch((error: unknown) => {
						logger.warn(`satori profile card failed, falling back to skia: ${error instanceof Error ? error.message : String(error)}`);
						return renderProfileCardDark({ ...base, statusColor: '#3ecf8e' });
					});
				}
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

	// 멤버 인사 카드 이미지 (환영/작별)
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
				throw new DataApiError(400, 'greeting_image_missing', '이미지 설정이 비어 있어요. useImage를 켜고 배경을 지정해 주세요.');
			}
			// 키에 페이로드 해시를 넣어요 — 배경·설정·유저 컨텍스트가 다른 동시 미리보기 요청이 첫 렌더를 공유하지 않게.
			const buffer = await deduped(`img:greeting:${body.guildId}:${body.kind}:${body.context.userId}:${payloadHash(body)}`, () =>
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

	// 멤버 인사 배경/레이어 업로드 정규화
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
				if (error instanceof Error && error.name === 'GreetingBackgroundError') return sendDomainError(reply, error, 'greeting_error');
				return sendError(reply, error);
			}
		});
	};
	registerGreetingImageNormalizeRoute('/v1/image/member-card/background', 'image-member-card-background', normalizeGreetingBackground);
	registerGreetingImageNormalizeRoute('/v1/image/member-card/layer-image', 'image-member-card-layer-image', normalizeGreetingLayerImage);

	// NowPlaying 카드 이미지
	// 카드는 트랙 식별자 + 볼륨/챕터 + 5초 위치 버킷마다 다시 렌더돼요
	// (도미넌트 색 배경 + 제목 + 다음 곡 목록 + 대기열 메타 + 브랜드줄).
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
		// 볼륨/노드 — 브랜드줄(brandLine)에 통합되어 카드 렌더에서는 미사용 (하위호환으로 유지)
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
			// 카드에는 재생 위치가 그려지지 않아요 — 위치를 뺀 페이로드 해시를 키로 써서, 같은 곡이라도 볼륨·일시정지·반복·챕터가
			// 다른 동시 요청이 첫 응답으로 합쳐지지 않게 하고 위치만 다른 요청은 합쳐요.
			const buffer = await deduped(`img:nowplaying:${body.trackId}:${payloadHash({ ...body, positionMs: 0 })}`, () =>
				// satori 카드가 기본이에요. 렌더에 실패하면(폰트 누락 등) 기존 skia 카드로 폴백해서 고정 채널 컨트롤러가 비지 않게 해요.
				renderNowPlayingCardSatori(body).catch((error) => {
					logger.warn(`satori now-playing card failed, falling back to skia: ${error instanceof Error ? error.message : String(error)}`);
					return renderNowPlayingCard(body);
				})
			);
			metrics.request('image-nowplaying');
			return reply.type('image/png').send(buffer);
		} catch (error) {
			return sendError(reply, error);
		}
	});

	// 운세 카드 이미지
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

	// 운세 TOP 3 카드 이미지 — 별자리 미지정 조회용. 같은 날짜·같은 구성이면 렌더를 공유해요.
	fastify.post('/v1/image/ohaasa/top', async (request, reply) => {
		try {
			const body = ohaasaTopCardSchema.parse(request.body);
			const key = body.items.map((item) => `${item.rank}-${item.zodiacCode}`).join(',');
			const buffer = await deduped(`img:ohaasa-top:${body.date || 'nodate'}:${key}`, () => renderOhaasaTopCard(body));
			metrics.request('image-ohaasa-top');
			return reply.type('image/png').send(buffer);
		} catch (error) {
			return sendError(reply, error);
		}
	});

	// 날씨 카드 이미지
	// 봇이 /v1/weather 결과에서 표시 필드만 골라 POST해요. 같은 위치·범위·관측 시각이면 렌더를 공유해요.
	fastify.post('/v1/image/weather', async (request, reply) => {
		try {
			const body = weatherCardSchema.parse(request.body);
			const buffer = await deduped(`img:weather:${body.scope}:${payloadHash(body)}`, () => renderWeatherCard(body));
			metrics.request('image-weather');
			return reply.type('image/png').send(buffer);
		} catch (error) {
			return sendError(reply, error);
		}
	});

	// Wrapped 카드 이미지 (satori) — 신청 이력을 data-api가 직접 집계해서 그려요 (봇은 표시 정보만 보내요).
	// guildId가 null이면 모든 서버를 합쳐요. DATABASE_URL이 없으면 503이에요.
	const wrappedCardSchema = z.object({
		userId: playerUserIdSchema,
		guildId: redisIdSchema.nullable().default(null),
		displayName: z.string().trim().min(1).max(64),
		avatarUrl: z.string().url().nullable().default(null),
		period: z.enum(['month', 'year', 'all']).default('month')
	});
	fastify.post('/v1/image/wrapped', async (request, reply) => {
		try {
			const body = wrappedCardSchema.parse(request.body);
			const db = getDb();
			if (!db) throw new DataApiError(503, 'db_unavailable', 'DB가 연결되지 않아 Wrapped를 만들 수 없어요.');
			const range = resolveWrappedRange(body.period);
			const stats = await loadWrappedStats(db, { userId: body.userId, guildId: body.guildId, from: range.from, to: range.to });
			const buffer = await renderWrappedCard({
				displayName: body.displayName,
				avatarUrl: body.avatarUrl,
				periodLabel: range.label,
				scopeLabel: body.guildId ? '이 서버' : '모든 서버',
				stats
			});
			metrics.request('image-wrapped');
			return reply.type('image/png').send(buffer);
		} catch (error) {
			return sendError(reply, error);
		}
	});
}
