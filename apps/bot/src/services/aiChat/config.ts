import { container } from '@sapphire/framework';
import type { AiMode } from '../guildService.ts';
import { ChatServiceError, type ChatConfig } from './types.ts';

/** .env에서 채팅 설정을 읽어요. 필수값이 없으면 null */
export function getChatConfig(): ChatConfig | null {
	const apiUrl = (process.env.OPENAI_COMPATIBLE_API_URL ?? 'http://127.0.0.1:8080/v1').trim().replace(/\/+$/, '');
	const model = (process.env.CHAT_MODEL ?? '').trim();
	if (!apiUrl || !model) return null;

	return {
		apiUrl,
		apiKey: (process.env.OPENAI_API_KEY ?? '').trim(),
		model,
		timeoutMs: Math.max(1000, parseInt(process.env.LLM_API_TIMEOUT_MS ?? '120000', 10) || 120_000),
		// help 커맨드의 타이핑 단계(420~560ms)와 맞춘 기본값 — webhook 편집 제한(5/2초) 여유 내
		streamUpdateMs: Math.max(200, parseInt(process.env.CHAT_STREAM_UPDATE_MS ?? '450', 10) || 450),
		thinkToken: (process.env.ENABLE_THINK_TOKEN ?? 'false').toLowerCase() === 'true'
	};
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
		return await container.guildService.getAiSettings(guildId);
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
