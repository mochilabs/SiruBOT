import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { greetingConfigSchema, redisIdSchema } from '@sirubot/utils';
import { deduped } from '../utils/dedup.ts';
import { metrics } from '../utils/metrics.ts';
import { DataApiError } from './serveCached.ts';
import { sendError } from './common.ts';
import { renderProfileCardDark } from '../renderers/profileCardDark.ts';
import { renderProfileCardTicket } from '../renderers/profileCardTicket.ts';
import { renderGreetingCard, normalizeGreetingBackground, normalizeGreetingLayerImage } from '../renderers/memberGreetingCard.ts';
import { renderNowPlayingCard } from '../renderers/nowPlayingCard.ts';
import { renderOhaasaCard } from '../renderers/ohaasaCard.ts';
import { ohaasaCardSchema } from './ohaasaCardSchema.ts';

/** 이미지 렌더 라우트 — 프로필 카드(dark/ticket)·멤버 인사 카드·NowPlaying·운세 카드 + 인사 이미지 정규화. 렌더러 본체는 renderers/에 있어요. */

/** dedup 키용 페이로드 해시 — 같은 유저의 다른 요청(preset·설정·배경 변경)이 첫 렌더를 공유하지 않게 키에 섞어 넣어요 */
function payloadHash(payload: unknown): string {
	return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
}

export function registerRenderRoutes(fastify: FastifyInstance): void {
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
}
