import { z } from 'zod';
import { redisIdSchema } from './redisChannels.js';

export const queuedTrackSummarySchema = z.object({
	title: z.string(),
	author: z.string(),
	durationMs: z.number(),
	artworkUrl: z.string().nullable(),
	uri: z.string().nullable().optional(),
	isStream: z.boolean(),
	requesterName: z.string().nullable()
});

export const playerStateSchema = z.object({
	guildId: redisIdSchema,
	playing: z.boolean(),
	paused: z.boolean(),
	positionMs: z.number(),
	durationMs: z.number(),
	trackTitle: z.string().nullable(),
	trackAuthor: z.string().nullable(),
	artworkUrl: z.string().nullable(),
	trackUri: z.string().nullable().optional(),
	isStream: z.boolean(),
	queue: z.array(queuedTrackSummarySchema).max(1000),
	queueLength: z.number(),
	repeatMode: z.enum(['off', 'track', 'queue']),
	volume: z.number(),
	requesterName: z.string().nullable(),
	sourceName: z.string().nullable(),
	updatedAt: z.number(),
	// Tombstone set when queue ends or player is destroyed; playerHub clears the entry instead of caching.
	ended: z.boolean().optional()
});

export const playerStateResponseSchema = z.object({
	...playerStateSchema.shape,
	ageMs: z.number(),
	stale: z.boolean()
});

export type QueuedTrackSummary = z.infer<typeof queuedTrackSummarySchema>;
export type PlayerStatePayload = z.infer<typeof playerStateSchema>;
export type PlayerStateResponse = z.infer<typeof playerStateResponseSchema>;
