import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError, container } from '@sapphire/framework';
import {
	ApplicationIntegrationType,
	ChatInputCommandInteraction,
	MessageFlags,
	PermissionFlagsBits,
	type SlashCommandSubcommandGroupBuilder,
	type SlashCommandSubcommandsOnlyBuilder
} from 'discord.js';
import { emoji } from '@sirubot/utils';
import { normalizeAiMode } from '../../../services/guildService.ts';
import { collectOtherTextChannelIds } from '../utils/channels.ts';
import { confirmAction } from '../../../lib/confirmation.ts';
import { acquireChannelTurn, releaseChannelTurn } from '../../../services/aiChatService.ts';
import { channelToggleView, settingResultView } from '../view/settingResult.ts';
import * as guildChatPolicy from '../../../services/guildSettings/chatPolicy.ts';

/**
 * AI 채팅 설정 서브커맨드 정의 — `/채팅설정`과 `/ai`가 같은 옵션을 써요.
 */
export function withChatSettingsSubcommands(builder: SlashCommandSubcommandsOnlyBuilder | SlashCommandSubcommandGroupBuilder): void {
	builder
		.addSubcommand((sub) =>
			sub
				.setName('status')
				.setNameLocalizations({ ko: '상태' })
				.setDescription('Show AI chat settings.')
				.setDescriptionLocalizations({ ko: 'AI 사용 범위와 현재 채널 상태를 확인해요.' })
		)
		.addSubcommand((sub) =>
			sub
				.setName('reset')
				.setNameLocalizations({ ko: '초기화' })
				.setDescription('Confirm resetting this channel history.')
				.setDescriptionLocalizations({ ko: '확인 후 이 채널 전체의 AI 대화 기록을 지워요.' })
		)
		.addSubcommand((sub) =>
			sub
				.setName('server')
				.setNameLocalizations({ ko: '서버' })
				.setDescription('Set how AI chat works for this server.')
				.setDescriptionLocalizations({ ko: '이 서버의 AI 채팅 모드를 바꿔요.' })
				.addStringOption((option) =>
					option
						.setName('mode')
						.setNameLocalizations({ ko: '모드' })
						.setDescription('AI chat mode: all channels, selected channels, or off.')
						.setDescriptionLocalizations({ ko: '모든 채널 / 특정 채널 / 끄기 중에서 골라요.' })
						.setRequired(true)
						.addChoices(
							{ name: 'All channels', name_localizations: { ko: '모든 채널' }, value: 'all' },
							{ name: 'Selected channels', name_localizations: { ko: '특정 채널' }, value: 'channels' },
							{ name: 'Off', name_localizations: { ko: '끄기' }, value: 'off' }
						)
				)
		)
		.addSubcommand((sub) =>
			sub
				.setName('channel')
				.setNameLocalizations({ ko: '채널' })
				.setDescription('Enable or disable AI chat for this channel.')
				.setDescriptionLocalizations({ ko: '현재 채널의 AI 채팅을 켜거나 꺼요.' })
				.addBooleanOption((option) =>
					option
						.setName('enabled')
						.setNameLocalizations({ ko: '켜기' })
						.setDescription('Whether AI chat is enabled in this channel.')
						.setDescriptionLocalizations({ ko: '현재 채널에서 AI 채팅 사용 여부예요.' })
						.setRequired(true)
				)
		);
}

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'chat-settings',
	description: 'Manage AI chat settings for this server and channels.',
	fullCategory: ['일반'],
	preconditions: ['ManageGuild']
})
export class ChatSettingsCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
				.setName(this.name)
				.setNameLocalizations({ ko: '채팅설정' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '서버·채널의 AI 채팅 on/off를 설정해요.' });
			withChatSettingsSubcommands(builder);
		});
	}

	/** `/설정 chat`가 같은 검증·핸들러를 재사용해요 */
	static async runFor(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
		return new ChatSettingsCommand(container.client as never).chatInputRun(interaction);
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) {
			throw new UserError({
				identifier: 'chat_settings_no_guild',
				message: `${emoji('error')} 서버 안에서만 사용할 수 있어요.`,
				context: { ephemeral: true }
			});
		}

		const guildId = interaction.guildId;
		if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild))
			throw new UserError({
				identifier: 'chat_settings_permission',
				message: `${emoji('error')} 서버 관리 권한이 필요해요.`,
				context: { ephemeral: true }
			});
		const subcommand = interaction.options.getSubcommand(true);
		await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
		if (subcommand === 'reset') {
			if (
				!(await confirmAction(
					interaction,
					'이 채널의 AI 기록을 지울까요?',
					'이 채널에서 함께 나눈 AI 대화와 요약을 삭제해요. 개인 AI 기억과 디스코드 메시지는 유지돼요.'
				))
			)
				return;
			if (!acquireChannelTurn(interaction.channelId))
				throw new UserError({
					identifier: 'chat_busy',
					message: `${emoji('error')} 지금 답변 중이에요. 답변이 끝난 뒤 초기화를 다시 실행해 주세요.`,
					context: { ephemeral: true }
				});
			try {
				await this.container.aiChatHistory.clearChannelHistory(interaction.channelId);
				await interaction.editReply({
					components: [
						settingResultView({
							icon: 'trash',
							title: 'AI 대화 기록 초기화',
							details: ['이 채널의 AI 대화와 요약을 지웠어요.'],
							hint: '봇을 멘션하면 새 대화를 시작해요.'
						})
					],
					flags: [MessageFlags.IsComponentsV2]
				});
			} finally {
				releaseChannelTurn(interaction.channelId);
			}
			return;
		}
		if (subcommand === 'status') {
			const current = await guildChatPolicy.getAiSettings(this.container.guildService, guildId);
			const active = current.mode === 'all' || (current.mode === 'channels' && current.channelIds.includes(interaction.channelId));
			await interaction.editReply({
				components: [
					settingResultView({
						icon: 'robot',
						title: 'AI 채팅 설정',
						details: [
							`**서버** ${current.mode === 'all' ? '모든 채널' : current.mode === 'off' ? '꺼짐' : `선택한 ${current.channelIds.length}개 채널`}`,
							`**이 채널** ${active ? '🟢 사용 가능' : '🔴 꺼짐'}`
						],
						hint: '봇을 멘션해서 대화를 시작해요. 이 채널의 대화 문맥은 참여자들이 함께 사용해요.'
					})
				],
				flags: [MessageFlags.IsComponentsV2]
			});
			return;
		}

		if (subcommand === 'server') {
			const mode = normalizeAiMode(interaction.options.getString('mode', true));
			await guildChatPolicy.setAiMode(this.container.guildService, guildId, mode);
			const current = await guildChatPolicy.getAiSettings(this.container.guildService, guildId);
			const scope =
				mode === 'all'
					? '서버의 모든 채널에서 사용할 수 있어요.'
					: mode === 'off'
						? '서버 어디에서도 사용할 수 없어요.'
						: `선택한 채널 ${current.channelIds.length}개에서만 사용할 수 있어요.`;
			const noChannel = mode === 'channels' && current.channelIds.length === 0;
			await interaction.editReply({
				flags: [MessageFlags.IsComponentsV2],
				allowedMentions: { parse: [] },
				components: [
					settingResultView({
						icon: 'robot',
						title: `AI 채팅 ${mode === 'all' ? '모든 채널' : mode === 'off' ? '꺼짐' : '선택한 채널만'}`,
						details: [noChannel ? '아직 허용된 채널이 없어서 지금은 어디서도 쓸 수 없어요.' : scope],
						hint: noChannel ? '`/채팅설정 채널 켜기`로 사용할 채널을 추가해 주세요.' : undefined
					})
				]
			});
			return;
		}

		if (subcommand === 'channel') {
			const enabled = interaction.options.getBoolean('enabled', true);
			// 끄기로 인해 목록을 만들어야 하는(all → channels) 경우를 위한 서버의 나머지 텍스트 채널
			const otherTextChannelIds = collectOtherTextChannelIds(interaction.guild, interaction.channelId);
			const result = await guildChatPolicy.setChannelAiEnabled(
				this.container.guildService,
				guildId,
				interaction.channelId,
				enabled,
				otherTextChannelIds
			);
			await interaction.editReply({
				flags: [MessageFlags.IsComponentsV2],
				allowedMentions: { parse: [] },
				components: [
					channelToggleView({
						icon: 'robot',
						label: 'AI 채팅',
						enabled,
						channelId: interaction.channelId,
						mode: result.mode,
						channelCount: result.channelIds.length
					})
				]
			});
			return;
		}
	}
}
