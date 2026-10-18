import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { emoji } from '@sirubot/utils';
import { buildTtsPanel } from '../utils/ttsView.ts';

/**
 * /tts — 채팅 TTS 사용자 설정 패널. 응답은 Components V2 ephemeral 컨테이너 하나다.
 * 낭독 on/off는 토글 버튼, 음성은 셀렉트, 속도·피치는 모달로 바꾼다. 자기 자신 설정이라
 * ManageGuild 권한은 필요 없다.
 */
@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'tts',
	description: '채팅을 음성으로 읽는 TTS 설정을 관리해요.',
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
				.setDescriptionLocalizations({ ko: '채팅 TTS 낭독 on/off와 음성 프리셋을 설정해요.' });
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

		await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
		await interaction.editReply({
			components: [await buildTtsPanel(this.container, interaction.guildId, interaction.user.id)],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { parse: [] }
		});
	}
}
