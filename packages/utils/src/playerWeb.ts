import { z } from 'zod';
import { MUSIC_VOLUME_MAX, MUSIC_VOLUME_MIN } from './playerLimits.js';
import { redisIdSchema } from './redisChannels.js';

// Channels: PLAYER_WEB_REQUEST_CHANNEL / PLAYER_WEB_RESPONSE_CHANNEL (see redisChannels.ts). Failures carry a Korean `error` shown to the user as-is.
export const playerWebKindSchema = z.enum(['search', 'play', 'control', 'voice-context']);
export type PlayerWebKind = z.infer<typeof playerWebKindSchema>;

export const playerWebControlActionSchema = z.enum([
	'volume',
	'pause',
	'resume',
	'skip',
	'stop',
	'repeat',
	'queue-shuffle',
	'queue-clear',
	'queue-remove',
	'queue-move',
	'queue-jump',
	'seek',
	'previous'
]);
export type PlayerWebControlAction = z.infer<typeof playerWebControlActionSchema>;

/** Branch on `code`, not on message text. */
export const PLAYER_WEB_CODE_SEARCH_EMPTY = 'search_empty';

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

/** Carries userId so the bot can resolve the member, voice channel and permissions. */
const playerWebRequestBase = z.object({
	requestId: z.string().uuid(),
	guildId: redisIdSchema,
	userId: redisIdSchema,
	kind: playerWebKindSchema
});

export const playerWebSearchRequestSchema = playerWebRequestBase.extend({
	kind: z.literal('search'),
	query: z.string().trim().min(1).max(200)
});
export type PlayerWebSearchRequest = z.infer<typeof playerWebSearchRequestSchema>;

/** http/https only: other schemes (file:, data:) could make Lavalink fetch from the internal network (SSRF). */
export const playerWebPlayUriSchema = z
	.string()
	.max(500)
	.url('재생 주소는 올바른 URL이어야 해요.')
	.regex(/^https?:\/\//i, '재생 주소는 http/https로 시작해야 해요.');

export const playerWebPlayRequestSchema = playerWebRequestBase.extend({
	kind: z.literal('play'),
	uri: playerWebPlayUriSchema
});
export type PlayerWebPlayRequest = z.infer<typeof playerWebPlayRequestSchema>;

const QUEUE_INDEX_MAX = 999;
/** 24 hours; the bot re-checks against the track length. */
export const PLAYER_WEB_SEEK_MAX_MS = 86_400_000;

export const playerWebControlRequestSchema = playerWebRequestBase
	.extend({
		kind: z.literal('control'),
		action: playerWebControlActionSchema,
		value: z.number().int().min(MUSIC_VOLUME_MIN).max(MUSIC_VOLUME_MAX).optional(),
		index: z.number().int().min(0).max(QUEUE_INDEX_MAX).optional(),
		from: z.number().int().min(0).max(QUEUE_INDEX_MAX).optional(),
		to: z.number().int().min(0).max(QUEUE_INDEX_MAX).optional(),
		positionMs: z.number().int().min(0).max(PLAYER_WEB_SEEK_MAX_MS).optional()
	})
	.superRefine((body, ctx) => {
		if (body.action === 'volume' && typeof body.value !== 'number') {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: `volume 제어에는 value(${MUSIC_VOLUME_MIN}~${MUSIC_VOLUME_MAX})가 필요해요.`
			});
		}
		if ((body.action === 'queue-remove' || body.action === 'queue-jump') && typeof body.index !== 'number') {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: `${body.action} 제어에는 index(0 이상 정수)가 필요해요.`
			});
		}
		if (body.action === 'seek' && typeof body.positionMs !== 'number') {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'seek 제어에는 positionMs(0 이상 정수)가 필요해요.'
			});
		}
		if (body.action === 'queue-move') {
			if (typeof body.from !== 'number' || typeof body.to !== 'number') {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'queue-move 제어에는 from·to(0 이상 정수)가 필요해요.'
				});
			} else if (body.from === body.to) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: '같은 위치로는 이동할 수 없어요.'
				});
			}
		}
	});
export type PlayerWebControlRequest = z.infer<typeof playerWebControlRequestSchema>;

export const playerWebVoiceContextRequestSchema = playerWebRequestBase.extend({ kind: z.literal('voice-context') });
export type PlayerWebVoiceContextRequest = z.infer<typeof playerWebVoiceContextRequestSchema>;

/** Loose first-pass parse; kind-specific schemas narrow it later. */
export const playerWebRequestBaseSchema = playerWebRequestBase;
export type PlayerWebRequestBase = z.infer<typeof playerWebRequestBase>;

export const playerVoiceContextSchema = z.object({
	inVoice: z.boolean(),
	voiceChannelName: z.string().nullable(),
	/** Null when not connected. Older bot replies without this field are accepted. */
	botVoiceChannelName: z.string().nullable().optional(),
	/** Computed with the same policy as actual authorization. */
	canControl: z.boolean(),
	/** Always sent; replies without it fail validation. */
	canPlay: z.boolean()
});
export type PlayerVoiceContext = z.infer<typeof playerVoiceContextSchema>;

/** Loose on purpose so new kinds and fields don't break older readers. */
export const playerWebResponseSchema = z.object({
	requestId: z.string().uuid(),
	guildId: redisIdSchema,
	kind: playerWebKindSchema,
	error: z.string().optional(),
	/** Machine-readable failure kind; unknown values are ignored. */
	code: z.string().optional(),
	tracks: z.array(playerWebTrackSchema).max(5).optional(),
	voice: playerVoiceContextSchema.optional()
});
export type PlayerWebResponse = z.infer<typeof playerWebResponseSchema>;
