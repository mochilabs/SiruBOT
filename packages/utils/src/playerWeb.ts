import { z } from 'zod';

/**
 * 웹 플레이어 request/reply 공용 계약 — bot과 data-api가 함께 쓴다.
 * 대시보드의 곡 검색·재생·라이브 제어·음성 상태 조회는 요청자의 음성 채널과 관리자/DJ 권한을
 * 봇 캐시로만 해석할 수 있으므로 guildData 조회와 같은 request/reply로 우회한다:
 * data-api(playerWebHub)가 REQUEST 채널(`sirubot:player-web:request`)로 요청을 퍼블리시하면
 * 해당 길드를 보유한 봇 프로세스(playerWebResponder)가 RESPONSE 채널(`sirubot:player-web:response`)로
 * 응답하고, hub가 requestId로 상관해 dashboard에 내려준다. 응답은 성공 형태 외에 한국어 error 메시지를
 * 실어 실패 이유를 그대로 사용자에게 보여줄 수 있게 해요.
 */
export const playerWebKindSchema = z.enum(['search', 'play', 'control', 'voice-context']);
export type PlayerWebKind = z.infer<typeof playerWebKindSchema>;

/** 라이브 제어 액션 — 슬래시 커맨드(/volume·/stop 등)와 같은 동작을 웹에서 수행해요 */
export const playerWebControlActionSchema = z.enum(['volume', 'pause', 'resume', 'skip', 'stop', 'repeat']);
export type PlayerWebControlAction = z.infer<typeof playerWebControlActionSchema>;

/** 검색 결과 요약 — 봇이 Lavalink SearchResult에서 뽑아 응답에 실어요 */
export const playerWebTrackSchema = z.object({
	title: z.string(),
	author: z.string(),
	durationMs: z.number(),
	artworkUrl: z.string().nullable(),
	uri: z.string(),
	sourceName: z.string().nullable(),
	isStream: z.boolean()
});
export type PlayerWebTrack = z.infer<typeof playerWebTrackSchema>;

/** 요청 공통부 + kind별 페이로드. 요청자(userId)까지 전달해 봇이 멤버·음성 채널·권한을 해석해요 */
const playerWebRequestBase = z.object({
	requestId: z.string().uuid(),
	guildId: z.string().min(1).max(32),
	userId: z.string().min(1).max(32),
	kind: playerWebKindSchema
});

export const playerWebSearchRequestSchema = playerWebRequestBase.extend({
	kind: z.literal('search'),
	query: z.string().trim().min(1).max(200)
});
export type PlayerWebSearchRequest = z.infer<typeof playerWebSearchRequestSchema>;

export const playerWebPlayRequestSchema = playerWebRequestBase.extend({
	kind: z.literal('play'),
	uri: z.string().url().max(500)
});
export type PlayerWebPlayRequest = z.infer<typeof playerWebPlayRequestSchema>;

export const playerWebControlRequestSchema = playerWebRequestBase
	.extend({
		kind: z.literal('control'),
		action: playerWebControlActionSchema,
		value: z.number().int().min(0).max(150).optional()
	})
	.refine((body) => body.action !== 'volume' || typeof body.value === 'number', {
		message: 'volume 제어에는 value(0~150)가 필요해요.'
	});
export type PlayerWebControlRequest = z.infer<typeof playerWebControlRequestSchema>;

export const playerWebVoiceContextRequestSchema = playerWebRequestBase.extend({ kind: z.literal('voice-context') });
export type PlayerWebVoiceContextRequest = z.infer<typeof playerWebVoiceContextRequestSchema>;

/** 요청 초기 파싱용 — requestId·guildId·userId·kind만 검증하고 kind별 상세는 각 스키마로 좁혀요 */
export const playerWebRequestBaseSchema = playerWebRequestBase;
export type PlayerWebRequestBase = z.infer<typeof playerWebRequestBase>;

/** 요청자의 음성·권한 상태 — voice-context 응답. 페이지에서 배지와 재생 UI를 이 값으로 그려요 */
export const playerVoiceContextSchema = z.object({
	inVoice: z.boolean(),
	voiceChannelName: z.string().nullable(),
	canControl: z.boolean()
});
export type PlayerVoiceContext = z.infer<typeof playerVoiceContextSchema>;

/**
 * 응답 — 성공이면 kind별 필드를 채우고, 실패면 error에 한국어 안내를 실어요.
 * 스키마는 loose하게 두어(미사용 필드 허용) 새 kind/필드 추가가 이전 읽기를 깨지 않게 해요.
 */
export const playerWebResponseSchema = z.object({
	requestId: z.string().uuid(),
	guildId: z.string().min(1).max(32),
	kind: playerWebKindSchema,
	error: z.string().optional(),
	tracks: z.array(playerWebTrackSchema).max(5).optional(),
	voice: playerVoiceContextSchema.optional()
});
export type PlayerWebResponse = z.infer<typeof playerWebResponseSchema>;
