import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { ApplicationIntegrationType, AutocompleteInteraction, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { emoji } from '@sirubot/utils';

/**
 * /tts — 채팅 TTS 사용자 설정: opt-in(on/off)과 음성 프리셋(voice/speed/pitch) 관리.
 * 자기 자신 설정이라 ManageGuild 권한은 필요 없다. 응답은 전부 ephemeral.
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
				.setDescriptionLocalizations({ ko: '채팅 TTS 낭독 on/off와 음성 프리셋을 설정해요.' })
				.addSubcommand((sub) =>
					sub
						.setName('on')
						.setNameLocalizations({ ko: '켜기' })
						.setDescription('Start reading your messages aloud.')
						.setDescriptionLocalizations({ ko: '내 메시지가 음성으로 읽히도록 켜요.' })
				)
				.addSubcommand((sub) =>
					sub
						.setName('off')
						.setNameLocalizations({ ko: '끄기' })
						.setDescription('Stop reading your messages aloud.')
						.setDescriptionLocalizations({ ko: '내 메시지 읽기를 꺼요.' })
				)
				.addSubcommand((sub) =>
					sub
						.setName('voice')
						.setNameLocalizations({ ko: '음성' })
						.setDescription('Choose your TTS voice. Omit to reset to the default.')
						.setDescriptionLocalizations({ ko: 'TTS 음성을 골라요. 비워 두면 기본 음성으로 돌아가요.' })
						.addStringOption((option) =>
							option
								.setName('voice')
								.setNameLocalizations({ ko: '음성' })
								.setDescription('TTS voice (engine:voice id, searchable).')
								.setDescriptionLocalizations({ ko: '검색으로 고르는 TTS 음성이에요.' })
								.setRequired(false)
								.setAutocomplete(true)
						)
				)
				.addSubcommand((sub) =>
					sub
						.setName('speed')
						.setNameLocalizations({ ko: '속도' })
						.setDescription('Set speech speed. Omit to reset to the default.')
						.setDescriptionLocalizations({ ko: '말하는 속도를 바꿔요. 비워 두면 기본값으로 돌아가요.' })
						.addNumberOption((option) =>
							option
								.setName('speed')
								.setNameLocalizations({ ko: '속도' })
								.setDescription('Speech speed (0.25-4.0).')
								.setDescriptionLocalizations({ ko: '말하는 속도(0.25~4.0)예요.' })
								.setRequired(false)
								.setMinValue(0.25)
								.setMaxValue(4)
						)
				)
				.addSubcommand((sub) =>
					sub
						.setName('pitch')
						.setNameLocalizations({ ko: '피치' })
						.setDescription('Set pitch offset. Omit to reset to the default.')
						.setDescriptionLocalizations({ ko: '음의 높이를 바꿔요. 비워 두면 기본값으로 돌아가요.' })
						.addNumberOption((option) =>
							option
								.setName('pitch')
								.setNameLocalizations({ ko: '피치' })
								.setDescription('Pitch offset in semitones (-12 to 12).')
								.setDescriptionLocalizations({ ko: '음의 높이(반음 -12~12)예요.' })
								.setRequired(false)
								.setMinValue(-12)
								.setMaxValue(12)
						)
				)
				.addSubcommand((sub) =>
					sub
						.setName('status')
						.setNameLocalizations({ ko: '상태' })
						.setDescription('Show your current TTS settings.')
						.setDescriptionLocalizations({ ko: '내 TTS 설정을 보여 줘요.' })
				);
		});
	}

	public override async autocompleteRun(interaction: AutocompleteInteraction) {
		if (interaction.options.getSubcommand(false) !== 'voice') return interaction.respond([]);
		const focused = interaction.options.getFocused();
		const voices = await this.container.ttsService.listVoices(focused);
		return interaction.respond(
			voices.slice(0, 25).map((voice) => ({
				name: `${voice.name}${voice.engine ? ` (${voice.engine})` : ''}`.slice(0, 100),
				value: voice.id
			}))
		);
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) {
			throw new UserError({
				identifier: 'tts_no_guild',
				message: `${emoji('error')} 서버 안에서만 사용할 수 있어요.`,
				context: { ephemeral: true }
			});
		}

		const guildId = interaction.guildId;
		const userId = interaction.user.id;
		const subcommand = interaction.options.getSubcommand(true);
		await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

		if (subcommand === 'on' || subcommand === 'off') {
			const enabled = subcommand === 'on';
			const ok = await this.container.ttsUserSettings.set(guildId, userId, { enabled });
			if (!ok)
				throw new UserError({
					identifier: 'tts_save_failed',
					message: `${emoji('error')} 설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.`
				});
			const readyNote =
				enabled && !this.container.ttsService.isEnabled() ? ' (봇의 TTS 서비스가 아직 준비되지 않았어요 — 관리자가 설정 중이에요)' : '';
			const content = enabled
				? `${emoji('speech')} 이제 당신의 메시지가 TTS로 읽혀요. \`/tts 끄기\`로 멈출 수 있어요.${readyNote}`
				: `${emoji('speech')} 채팅 TTS 낭독을 껐어요.`;
			await interaction.editReply({ allowedMentions: { parse: [] }, content });
			return;
		}

		if (subcommand === 'voice') {
			const voice = interaction.options.getString('voice') ?? null;
			const ok = await this.container.ttsUserSettings.set(guildId, userId, { voice });
			if (!ok)
				throw new UserError({
					identifier: 'tts_save_failed',
					message: `${emoji('error')} 설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.`
				});
			const content = voice
				? `${emoji('speech')} TTS 음성을 **${voice}**로 바꿨어요.`
				: `${emoji('speech')} TTS 음성을 기본 음성으로 되돌렸어요.`;
			await interaction.editReply({ allowedMentions: { parse: [] }, content });
			return;
		}

		if (subcommand === 'speed') {
			const speed = interaction.options.getNumber('speed') ?? null;
			const ok = await this.container.ttsUserSettings.set(guildId, userId, { speed });
			if (!ok)
				throw new UserError({
					identifier: 'tts_save_failed',
					message: `${emoji('error')} 설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.`
				});
			const content =
				speed !== null
					? `${emoji('speech')} 말하는 속도를 **${speed}x**로 바꿨어요.`
					: `${emoji('speech')} 말하는 속도를 기본값으로 되돌렸어요.`;
			await interaction.editReply({ allowedMentions: { parse: [] }, content });
			return;
		}

		if (subcommand === 'pitch') {
			const pitch = interaction.options.getNumber('pitch') ?? null;
			const ok = await this.container.ttsUserSettings.set(guildId, userId, { pitch });
			if (!ok)
				throw new UserError({
					identifier: 'tts_save_failed',
					message: `${emoji('error')} 설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.`
				});
			const content =
				pitch !== null
					? `${emoji('speech')} 음의 높이를 **${pitch > 0 ? `+${pitch}` : pitch}**로 바꿨어요.`
					: `${emoji('speech')} 음의 높이를 기본값으로 되돌렸어요.`;
			await interaction.editReply({ allowedMentions: { parse: [] }, content });
			return;
		}

		if (subcommand === 'status') {
			const preset = await this.container.ttsUserSettings.get(guildId, userId);
			const lines = [
				`${emoji('speech')} **채팅 TTS 설정**`,
				`낭독: ${preset.enabled ? '**켜짐**' : '꺼짐 (\\`/tts 켜기\\`로 켜요)'}`,
				`음성: ${preset.voice ?? '기본 음성'}`,
				`속도: ${preset.speed !== null ? `${preset.speed}x` : '기본값'}`,
				`피치: ${preset.pitch !== null ? `${preset.pitch > 0 ? `+${preset.pitch}` : String(preset.pitch)}` : '기본값'}`
			];
			await interaction.editReply({ allowedMentions: { parse: [] }, content: lines.join('\n') });
			return;
		}
	}
}
