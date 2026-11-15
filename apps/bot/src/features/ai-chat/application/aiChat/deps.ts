import type { Client } from 'discord.js';
import type { AppLogger } from '../../../../lib/appLogger.ts';
import type { AiMemoryService } from '../aiMemoryService.ts';
import type { GuildService } from '../../../../services/guildService.ts';
import type { AiToolContext, AiToolDefinition } from '../aiTools/types.ts';
import type { ChannelHistoryStore } from './historyStore.ts';
import type { MemoryPromotionJobs } from './memoryPromotion.ts';
import type { TurnCounterStore } from './turnControl.ts';

/** 에이전트 루프가 쓰는 도구 레지스트리 — 정의 목록·진행 멘트·실행 세 가지예요 */
export interface AiToolRegistry {
	getDefinitions(): AiToolDefinition[];
	getStatus(name: string, rawArguments?: string): string;
	execute(name: string, rawArguments: string, ctx: AiToolContext): Promise<string>;
}

/** 프롬프트가 현재 음악 한 줄을 적을 때 읽는 플레이어의 일부예요 — 구체적인 플레이어 클래스를 몰라도 되게 필요한 멤버만 둬요 */
export interface AiChatPlayerView {
	paused: boolean;
	queue?: { current?: { info: { title: string; author: string } } | null };
}

/**
 * AI 채팅 파이프라인이 쓰는 의존성 — BotApplication.setupServices가 한 번 엮어요.
 * client·플레이어 매니저는 부팅 뒤에 채워져서 호출 시점에 읽어요.
 */
export interface AiChatDeps {
	logger: AppLogger;
	guildService: GuildService;
	memory: AiMemoryService;
	history: ChannelHistoryStore;
	/** 진행 중인 기억 압축·승격 작업 — 종료 때 기다릴 수 있게 소유자를 따로 둬요 */
	promotions: MemoryPromotionJobs;
	tools: AiToolRegistry;
	getClient: () => Client;
	/** audio(플레이어 매니저)는 setupAudio 뒤에 생겨요 — 아직 없으면 undefined */
	getPlayer: (guildId: string) => AiChatPlayerView | null | undefined;
	/** redisStore는 setupServices 뒤(setupRedis)에 만들어져서 호출 시점에 읽어요 — 아직 없으면 undefined */
	getRedisStore: () => TurnCounterStore;
	/** 시스템 프롬프트 전체 토큰 예산(CHAT_CONTEXT_TOKEN_BUDGET) — 호출할 때마다 읽어요 */
	getContextTokenBudget: () => number;
}
