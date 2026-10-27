import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { emoji } from '@sirubot/utils';
import { collectOtherTextChannelIds } from '../utils/channels.ts';
import { buildTtsPanel } from '../utils/ttsView.ts';

/**
 * /tts — 채널 낭독 on/off + 사용자 TTS 설정 패널.
 * - 켜기/끄기: 현재 채널의 낭독 정책(길드 ttsMode)을 바꿔요. 채널 전체에 영향을 주므로
 *   서버 관리 권한이 필요해요. 켜기는 실행한 본인의 낭독 opt-in도 함께 켜요.
 * - 설정: 낭독 on/off·음성·속도·피치 패널(Components V2 ephemeral). 자기 자신 설정이라
 *   권한이 필요 없어요.
 */
@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'tts',
	description: 'Toggle channel reading and manage your TTS settings.',
	fullCategory: ['일반']
})
export class TtsCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: 'tts' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '채널 낭독 on/off와 내 TTS 설정을 관리해요.' })
				.addSubcommand((sub) =>
					sub
						.setName('on')
						.setNameLocalizations({ ko: '켜기' })
						.setDescription('Enable TTS reading for this channel.')
						.setDescriptionLocalizations({ ko: '현재 채널에서 보낸 메시지를 읽어드려요.' })
				)
				.addSubcommand((sub) =>
					sub
						.setName('off')
						.setNameLocalizations({ ko: '끄기' })
						.setDescription('Disable TTS reading for this channel.')
						.setDescriptionLocalizations({ ko: '현재 채널의 채팅 낭독을 꺼요.' })
				)
				.addSubcommand((sub) =>
					sub
						.setName('settings')
						.setNameLocalizations({ ko: '설정' })
						.setDescription('Open your personal TTS settings panel.')
						.setDescriptionLocalizations({ ko: '내 낭독 on/off·음성·속도·피치 패널을 열어요.' })
				);
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) {
			throw new UserError({
				identifier: 'tts_no_guild',
				message: `${emoji('error')} 서버 안에서만 사용할 수 있어요.`,
				context: { ephemeral: true }
			});
		}

		const subcommand = interaction.options.getSubcommand(true);
		// 켜기/끄기는 채널 전체에 영향을 주는 길드 정책이라 서버 관리 권한이 필요해요.
		// 설정 패널은 자기 자신 설정이라 누구나 쓸 수 있어요.
		if (subcommand !== 'settings' && !interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
			throw new UserError({
				identifier: 'tts_channel_permission',
				message: `${emoji('error')} 채널 낭독 on/off는 서버 관리 권한이 필요해요. 개인 설정은 \`/tts 설정\`을 사용해 주세요.`,
				context: { ephemeral: true }
			});
		}
		if (subcommand === 'on' && !this.container.ttsService.isEnabled()) {
			throw new UserError({
				identifier: 'tts_service_disabled',
				message: `${emoji('error')} TTS 서버가 연결되어 있지 않아서 낭독을 켤 수 없어요. 잠시 후 다시 시도해 주세요.`,
				context: { ephemeral: true }
			});
		}

		await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

		if (subcommand === 'settings') {
			await interaction.editReply({
				components: [await buildTtsPanel(this.container, interaction.guildId, interaction.user.id)],
				flags: [MessageFlags.IsComponentsV2],
				allowedMentions: { parse: [] }
			});
			return;
		}

		// 끄기로 all → channels를 만들 때 남길 목록을 위해 서버의 나머지 텍스트 채널을 모아요.
		const otherTextChannelIds = collectOtherTextChannelIds(interaction.guild, interaction.channelId);
		const enabled = subcommand === 'on';
		const result = await this.container.guildService.setChannelTtsEnabled(
			interaction.guildId,
			interaction.channelId,
			enabled,
			otherTextChannelIds
		);

		if (!enabled) {
			const content =
				result.mode === 'off'
					? `${emoji('speech')} 이 채널의 채팅 낭독을 껐어요. 허용된 채널이 더 없어서 서버에서 낭독이 모두 꺼졌어요.`
					: `${emoji('speech')} 이 채널의 채팅 낭독을 껐어요. (남은 허용 채널 ${result.channelIds.length}개)`;
			await interaction.editReply({ allowedMentions: { parse: [] }, content });
			return;
		}

		// 낭독은 채널 정책과 사용자 opt-in이 둘 다 켜져야 해요 — 켜기를 실행한 본인의
		// opt-in도 함께 켜서 "켰는데 왜 안 읽어요?"가 생기지 않게 해요.
		const saved = await this.container.ttsUserSettings.set(interaction.guildId, interaction.user.id, { enabled: true });
		const content = saved
			? `${emoji('speech')} 지금부터 <#${interaction.channelId}>에서 보낸 메시지를 읽어드릴게요. 다른 분들의 메시지도 읽으려면 각자 \`/tts 설정\`에서 낭독을 켜 주세요.`
			: `${emoji('error')} 채널 낭독은 켰지만 내 낭독 설정을 저장하지 못했어요. \`/tts 설정\`에서 낭독을 직접 켜 주세요.`;
		await interaction.editReply({ allowedMentions: { parse: [] }, content });
	}
}
