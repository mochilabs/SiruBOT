import { z } from 'zod';
import { redisIdSchema } from './redisChannels.js';

export const botAdminKindSchema = z.enum(['nodes-status', 'node-reconnect', 'node-disconnect', 'emojis-list', 'emojis-sync', 'reload-stores']);
export type BotAdminKind = z.infer<typeof botAdminKindSchema>;

export const botAdminNodeItemSchema = z.object({
	id: z.string(),
	host: z.string(),
	port: z.number().int(),
	connected: z.boolean(),
	sessionId: z.string().nullable(),
	players: z.number().int().nonnegative(),
	playingPlayers: z.number().int().nonnegative(),
	uptimeMs: z.number().nonnegative(),
	memoryUsedBytes: z.number().nonnegative(),
	memoryReservableBytes: z.number().nonnegative(),
	cpuLavalinkLoad: z.number().nonnegative(),
	cpuSystemLoad: z.number().nonnegative(),
	pingMs: z.number().nullable()
});
export type BotAdminNodeItem = z.infer<typeof botAdminNodeItemSchema>;

export const botAdminEmojiItemSchema = z.object({
	id: z.string(),
	name: z.string()
});
export type BotAdminEmojiItem = z.infer<typeof botAdminEmojiItemSchema>;

export const botAdminReloadStoreSchema = z.object({
	storeName: z.string(),
	total: z.number().int().nonnegative(),
	succeeded: z.number().int().nonnegative(),
	failed: z.number().int().nonnegative()
});
export type BotAdminReloadStore = z.infer<typeof botAdminReloadStoreSchema>;

export const botAdminRequestSchema = z
	.object({
		requestId: z.string().uuid(),
		kind: botAdminKindSchema,
		nodeId: redisIdSchema.optional()
	})
	.refine((val) => (val.kind !== 'node-reconnect' && val.kind !== 'node-disconnect') || typeof val.nodeId === 'string', {
		message: '노드 제어에는 nodeId가 필요해요.'
	});
export type BotAdminRequest = z.infer<typeof botAdminRequestSchema>;

export const botAdminResponseSchema = z.object({
	requestId: z.string().uuid(),
	kind: botAdminKindSchema,
	nodes: z.array(botAdminNodeItemSchema).max(50).optional(),
	emojis: z.array(botAdminEmojiItemSchema).max(500).optional(),
	stores: z.array(botAdminReloadStoreSchema).max(50).optional(),
	message: z.string().optional(),
	error: z.string().optional()
});
export type BotAdminResponse = z.infer<typeof botAdminResponseSchema>;
