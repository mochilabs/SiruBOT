import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { createContainer } from '@sirubot/utils';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { MixerRequestError } from '../../../services/mixerService.ts';

const MAX_TEXT_LENGTH = 200;
const TTS_DUCK_LEVEL = 0.2;

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'tts',
	description: 'Play text-to-speech over the current song.',
	fullCategory: ['음악'],
	preconditions: ['TextChannelAllowed', 'NodeAvailable', 'VoiceConnected', 'SameVoiceChannel', 'SongPlaying']
})
export class TtsCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '음성', 'en-US': 'tts' })
				.setDescription(this.description)
				.setDescriptionLocalizations({
					ko: '현재 재생 중인 곡 위에 입력한 내용을 음성으로 재생해요.',
					'en-US': 'Play text-to-speech over the current song.'
				})
				.addStringOption((option) =>
					option
						.setName('text')
						.setNameLocalizations({ ko: '내용', 'en-US': 'text' })
						.setDescription('Text to speak in Korean.')
						.setDescriptionLocalizations({ ko: '음성으로 읽을 내용을 입력해 주세요.', 'en-US': 'Text to speak in Korean.' })
						.setMinLength(1)
						.setMaxLength(MAX_TEXT_LENGTH)
						.setRequired(true)
				);
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) {
			throw new UserError({
				identifier: 'tts_not_in_guild',
				message: '❌ 길드 안에서만 사용할 수 있어요.',
				context: { ephemeral: true }
			});
		}

		await interaction.deferReply();

		const text = interaction.options.getString('text', true).trim();
		if (!text) {
			throw new UserError({
				identifier: 'tts_empty_text',
				message: '❌ 음성으로 읽을 내용을 입력해 주세요.',
				context: { ephemeral: true }
			});
		}

		if (text.length > MAX_TEXT_LENGTH) {
			throw new UserError({
				identifier: 'tts_text_too_long',
				message: '❌ 음성 안내 내용은 200자까지 입력할 수 있어요.',
				context: { ephemeral: true }
			});
		}

		const player = this.container.audio.getPlayer(interaction.guildId);
		if (!player) {
			throw new UserError({
				identifier: 'tts_no_player',
				message: '❌ 재생 중인 곡이 없어요.',
				context: { ephemeral: true }
			});
		}

		const ttsUrl = `https://translate.google.com/translate_tts?client=tw-ob&tl=ko&q=${encodeURIComponent(text)}`;

		try {
			await this.container.mixerService.announce(player, ttsUrl, TTS_DUCK_LEVEL);
		} catch (error) {
			throw new UserError({
				identifier: error instanceof MixerRequestError && error.status === 409 ? 'tts_mixer_busy' : 'tts_mixer_failed',
				message:
					error instanceof MixerRequestError && error.status === 409
						? '❌ 현재 다른 음성 효과가 진행 중이에요. 잠시 후 다시 시도해 주세요.'
						: '❌ 음성 안내를 재생하지 못했어요. 잠시 후 다시 시도해 주세요.',
				context: { ephemeral: true }
			});
		}

		await interaction.editReply({
			components: [createContainer().addTextDisplayComponents((textDisplay) => textDisplay.setContent('🔊 입력한 내용을 음성으로 재생해요.'))],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { roles: [], users: [] }
		});
	}
}
