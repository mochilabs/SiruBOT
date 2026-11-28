import type { AppLogger } from '../../../../lib/appLogger.ts';
import type { AiMode } from '../../../../services/guildService.ts';
import { ChatServiceError } from './types.ts';
import type { GuildService } from '../../../../services/guildService.ts';
import * as guildChatPolicy from '../../../../services/guildSettings/chatPolicy.ts';

export interface AiChatPolicy {
	mode: AiMode;
	channelIds: string[];
}

export async function getAiChatPolicy(deps: { guildService: GuildService; logger: AppLogger }, guildId: string | null): Promise<AiChatPolicy> {
	const fallback: AiChatPolicy = { mode: 'all', channelIds: [] };
	if (!guildId) return fallback;
	try {
		return await guildChatPolicy.getAiSettings(deps.guildService, guildId);
	} catch (error) {
		deps.logger.error('[aiChat] failed to load ai policy:', error);
		return fallback;
	}
}

export function assertChatEnabled(policy: AiChatPolicy, channelId: string): void {
	if (policy.mode === 'off') throw new ChatServiceError('chat_disabled', '이 서버에서 AI 채팅이 꺼져 있어요.');
	if (policy.mode === 'channels' && !policy.channelIds.includes(channelId)) {
		throw new ChatServiceError('chat_disabled', '이 채널에서는 AI 채팅을 사용할 수 없어요.');
	}
}
