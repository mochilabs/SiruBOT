import { emoji } from '@sirubot/utils';
import type { Guild } from '@sirubot/prisma';
import { ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType } from 'discord.js';
import { collectOtherTextChannelIds } from '../../../../lib/textChannels.ts';
import * as guildChatPolicy from '../../../../services/guildSettings/chatPolicy.ts';
import {
	CHAT_TOOL_TOGGLE_FIELDS,
	isChannelToggleEnabled,
	normalizeChatToolMode,
	type ChatToolName
} from '../../../../services/guildSettings/types.ts';
import type { SettingsContext, SettingsEntry } from './types.ts';

export const CHAT_TOOL_LABELS: Record<ChatToolName, string> = {
	emojiEnlarge: '이모지 확대',
	quote: '메시지 인용',
	embedFix: '임베드 복구'
};

/** 채널 한 곳에서 채팅 유틸 기능이 켜져 있는지 — 채널 정보가 없으면 꺼짐으로 봐요 */
export function chatToolEnabledIn(guild: Guild, tool: ChatToolName, channelId: string | undefined): boolean {
	if (!channelId) return false;
	const fields = CHAT_TOOL_TOGGLE_FIELDS[tool];
	return isChannelToggleEnabled({ mode: normalizeChatToolMode(guild[fields.mode]), channelIds: guild[fields.channelIds] }, channelId);
}

/** 패널이 놓인 채널에서 기능 하나를 뒤집어요 — 토글 규칙은 AI 채팅·TTS와 같아요 */
function toggleTool(tool: ChatToolName) {
	return async ({ interaction, guildId, channelId, services }: SettingsContext) => {
		const settings = await guildChatPolicy.getChatToolSettings(services.guildService, guildId);
		const enable = !isChannelToggleEnabled(settings[tool], channelId);
		// 끄기로 all → channels를 만들 때 남길 목록을 위해 서버의 나머지 텍스트 채널을 모아요.
		await guildChatPolicy.setChannelChatToolEnabled(
			services.guildService,
			guildId,
			tool,
			channelId,
			enable,
			collectOtherTextChannelIds(interaction.guild, channelId)
		);
	};
}

function toolButton(tool: ChatToolName) {
	return {
		screen: 'chatTools' as const,
		row: 'tools',
		build: (guild: Guild, ctx: { channelId?: string }) =>
			new ButtonBuilder()
				.setLabel(`${CHAT_TOOL_LABELS[tool]} ${chatToolEnabledIn(guild, tool, ctx.channelId) ? '끄기' : '켜기'}`)
				.setStyle(ButtonStyle.Secondary)
	};
}

/** 채팅 유틸·카운팅 페이지 — 구 `/채팅유틸`의 채널별 기능 on/off와 카운팅 채널 지정 */
export const chatToolsActions = {
	toggleEmojiEnlarge: { mode: 'chatTools', apply: toggleTool('emojiEnlarge'), control: toolButton('emojiEnlarge') },
	toggleQuote: { mode: 'chatTools', apply: toggleTool('quote'), control: toolButton('quote') },
	toggleEmbedFix: { mode: 'chatTools', apply: toggleTool('embedFix'), control: toolButton('embedFix') },
	// 카운팅 채널을 지정하면 그 순간 켜지고 기록은 새로 시작해요
	selectCountingChannel: {
		mode: 'chatTools',
		apply: async ({ interaction, guildId, services }) => {
			if (!interaction.isChannelSelectMenu()) return;
			await guildChatPolicy.setCountingChannel(services.guildService, guildId, interaction.values[0]);
			await services.countingState.reset(guildId);
			return { notice: `${emoji('crown')} <#${interaction.values[0]}> 채널에서 1부터 차례로 숫자를 세어요. 기록은 0으로 새로 시작했어요.` };
		},
		control: {
			screen: 'chatTools',
			row: 'counting',
			build: () =>
				new ChannelSelectMenuBuilder()
					.setPlaceholder('카운팅 채널을 선택하세요')
					.setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
		}
	},
	disableCounting: {
		mode: 'chatTools',
		apply: async ({ guildId, services }) => {
			await guildChatPolicy.setCountingEnabled(services.guildService, guildId, false);
			await services.countingState.reset(guildId);
		},
		control: {
			screen: 'chatTools',
			row: 'actions',
			build: (guild) => new ButtonBuilder().setLabel('카운팅 끄기').setStyle(ButtonStyle.Danger).setDisabled(!guild.countingEnabled)
		}
	}
} satisfies Record<string, SettingsEntry>;
