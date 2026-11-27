import type { Client } from 'discord.js';
import type { AppLogger } from '../../../../lib/appLogger.ts';
import type { AiMemoryService } from '../aiMemoryService.ts';
import type { GuildService } from '../../../../services/guildService.ts';
import type { AiToolContext, AiToolDefinition, AiToolEffect } from '../aiTools/types.ts';
import type { ChannelHistoryStore } from './historyStore.ts';
import type { MemoryPromotionJobs } from './memoryPromotion.ts';
import type { TurnCounterStore } from './turnControl.ts';

export interface AiToolRegistry {
	getDefinitions(): AiToolDefinition[];
	getStatus(name: string, rawArguments?: string): string;
	getEffect(name: string): AiToolEffect | undefined;
	returnsExternalContent(name: string): boolean;
	describeCall(name: string, rawArguments: string): string;
	execute(name: string, rawArguments: string, ctx: AiToolContext): Promise<string>;
}

export interface AiChatPlayerView {
	paused: boolean;
	queue?: { current?: { info: { title: string; author: string } } | null };
}

/** client·audio·redisStore는 부팅 뒤에 채워져 getter로 호출 시점에 읽어요. */
export interface AiChatDeps {
	logger: AppLogger;
	guildService: GuildService;
	memory: AiMemoryService;
	history: ChannelHistoryStore;
	promotions: MemoryPromotionJobs;
	tools: AiToolRegistry;
	getClient: () => Client;
	getPlayer: (guildId: string) => AiChatPlayerView | null | undefined;
	getRedisStore: () => TurnCounterStore;
	getContextTokenBudget: () => number;
}
