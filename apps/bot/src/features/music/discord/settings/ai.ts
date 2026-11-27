import { emoji } from '@sirubot/utils';
import { ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { confirmAction } from '../../../../lib/confirmation.ts';
import * as guildChatPolicy from '../../../../services/guildSettings/chatPolicy.ts';
import { normalizeAiMode, type AiMode } from '../../../../services/guildSettings/types.ts';
import { AI_MODE_LABELS } from './labels.ts';
import type { SettingsEntry } from './types.ts';

const AI_MODE_DESCRIPTIONS: Record<AiMode, string> = {
	all: '멘션하면 어떤 텍스트 채널에서든 답해요.',
	channels: '대시보드에서 고른 채널에서만 답해요.',
	off: '이 서버에서는 AI 채팅을 쓸 수 없어요.'
};

export const aiActions = {
	selectAiMode: {
		mode: 'ai',
		apply: async ({ interaction, guildId, services }) => {
			if (!interaction.isStringSelectMenu()) return;
			await guildChatPolicy.setAiMode(services.guildService, guildId, normalizeAiMode(interaction.values[0]));
		},
		control: {
			screen: 'ai',
			row: 'mode',
			build: (guild) => {
				const current = normalizeAiMode(guild.aiMode);
				return new StringSelectMenuBuilder()
					.setPlaceholder('AI 채팅 사용 범위')
					.setMinValues(1)
					.setMaxValues(1)
					.addOptions(
						(Object.keys(AI_MODE_LABELS) as AiMode[]).map((value) => ({
							label: AI_MODE_LABELS[value],
							value,
							description: AI_MODE_DESCRIPTIONS[value],
							default: current === value
						}))
					);
			}
		}
	},
	resetAiHistory: {
		mode: 'ai',
		apply: async ({ interaction, channelId, services }) => {
			if (!interaction.isButton()) return;
			const confirmed = await confirmAction(
				interaction,
				'이 채널의 AI 기록을 지울까요?',
				'이 채널에서 함께 나눈 AI 대화와 요약을 삭제해요. 개인 AI 기억과 디스코드 메시지는 유지돼요.'
			);
			if (!confirmed) return;
			if (!services.aiChat.acquireChannelTurn(channelId)) {
				return { notice: `${emoji('error')} 지금 답변 중이에요. 답변이 끝난 뒤 초기화를 다시 실행해 주세요.`, warn: true };
			}
			try {
				await services.aiChatHistory.clearChannelHistory(channelId);
			} finally {
				services.aiChat.releaseChannelTurn(channelId);
			}
			return { notice: `${emoji('trash')} 이 채널의 AI 대화와 요약을 지웠어요. 봇을 멘션하면 새 대화를 시작해요.` };
		},
		control: {
			screen: 'ai',
			row: 'actions',
			build: () => new ButtonBuilder().setEmoji(emoji('trash')).setLabel('이 채널 대화 기록 초기화').setStyle(ButtonStyle.Danger)
		}
	}
} satisfies Record<string, SettingsEntry>;
