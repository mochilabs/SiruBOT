import { z } from 'zod';

/**
 * 플레이어 상태 스냅샷 계약 — 봇(bot playerStatePublisher)이 Redis Pub/Sub으로 퍼블리시하고
 * data-api(playerHub)가 유일 구독자로 캐시하며, dashboard live 라우트가 이를 프록시해요.
 * 여기 한 곳에서 타입·검증을 정의해 이전처럼 3곳에서 수동 동기화하던 계약 어긋남을 막아요.
 * 의도적으로 loose(unknown 키 허용) — 새 필드 추가가 이전 릴리스 읽기를 깨지 않게.
 */
export const queuedTrackSummarySchema = z.object({
	title: z.string(),
	author: z.string(),
	durationMs: z.number(),
	artworkUrl: z.string().nullable(),
	isStream: z.boolean(),
	requesterName: z.string().nullable()
});

export const playerStateSchema = z.object({
	guildId: z.string(),
	playing: z.boolean(),
	paused: z.boolean(),
	positionMs: z.number(),
	durationMs: z.number(),
	trackTitle: z.string().nullable(),
	trackAuthor: z.string().nullable(),
	artworkUrl: z.string().nullable(),
	isStream: z.boolean(),
	queue: z.array(queuedTrackSummarySchema),
	queueLength: z.number(),
	repeatMode: z.enum(['off', 'track', 'queue']),
	volume: z.number(),
	requesterName: z.string().nullable(),
	sourceName: z.string().nullable(),
	updatedAt: z.number()
});

/** playerHub가 나이·stale을 덧붙여 내려주는 형태 — dashboard가 이를 검증해요 */
export const playerStateResponseSchema = z.object({
	...playerStateSchema.shape,
	ageMs: z.number(),
	stale: z.boolean()
});

export type QueuedTrackSummary = z.infer<typeof queuedTrackSummarySchema>;
export type PlayerStatePayload = z.infer<typeof playerStateSchema>;
export type PlayerStateResponse = z.infer<typeof playerStateResponseSchema>;
