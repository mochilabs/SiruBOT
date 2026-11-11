import { container } from '@sapphire/framework';
import { getConfig } from '../../core/config.ts';
import type { AiMode } from '../guildService.ts';
import { ChatServiceError, type ChatConfig } from './types.ts';
import * as guildChatPolicy from '../guildSettings/chatPolicy.ts';

/** .env에서 채팅 설정을 읽어요. 필수값이 없으면 null */
export function getChatConfig(): ChatConfig | null {
	const { apiUrl, apiKey, model, timeoutMs, streamUpdateMs, thinkToken } = getConfig().aiChat;
	if (!apiUrl || !model) return null;

	return { apiUrl, apiKey, model, timeoutMs, streamUpdateMs, thinkToken };
}

// 서버/채널 AI 설정
export interface AiChatPolicy {
	/** all: 모든 채널 / channels: 특정 채널만 / off: 끄기 */
	mode: AiMode;
	/** mode가 channels일 때만 사용하는 허용 채널 목록 */
	channelIds: string[];
}

/** 서버(Guild) 단위 AI 채팅 설정. 길드가 없으면(DM) 전부 기본값이에요. */
export async function getAiChatPolicy(guildId: string | null): Promise<AiChatPolicy> {
	const fallback: AiChatPolicy = { mode: 'all', channelIds: [] };
	if (!guildId) return fallback;
	try {
		return await guildChatPolicy.getAiSettings(container.guildService, guildId);
	} catch (error) {
		container.logger.error('[aiChat] failed to load ai policy:', error);
		return fallback;
	}
}

/** 현재 턴이 이 채널에서 돌 수 있는지 확인해요. 꺼져 있으면 chat_cancelled가 아닌 chat_disabled 오류. */
export function assertChatEnabled(policy: AiChatPolicy, channelId: string): void {
	if (policy.mode === 'off') throw new ChatServiceError('chat_disabled', '이 서버에서 AI 채팅이 꺼져 있어요.');
	if (policy.mode === 'channels' && !policy.channelIds.includes(channelId)) {
		throw new ChatServiceError('chat_disabled', '이 채널에서는 AI 채팅을 사용할 수 없어요.');
	}
}
