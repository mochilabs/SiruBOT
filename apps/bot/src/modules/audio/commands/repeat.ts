import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import * as view from '../view/repeat.ts';
import { RepeatMode } from 'lavalink-client';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'repeat',
	description: '반복 모드를 설정해요.',
	fullCategory: ['음악'],
	preconditions: ['TextChannelAllowed', 'NodeAvailable', 'SongPlaying', 'DJOrAlone']
})
export class RepeatCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({
					ko: '반복'
				})
				.setDescription(this.description)
				.setDescriptionLocalizations({
					ko: '반복 모드를 설정해요.'
				})
				.addStringOption((option) =>
					option
						.setName('mode')
						.setDescription('Set the repeat mode.')
						.setNameLocalizations({ ko: '모드' })
						.setDescriptionLocalizations({ ko: '반복 모드를 설정해요.' })
						.addChoices([
							{
								name: 'off',
								name_localizations: { ko: '끄기' },
								value: 'off'
							},
							{
								name: 'queue',
								name_localizations: { ko: '전체 곡' },
								value: 'queue'
							},
							{
								name: 'track',
								name_localizations: { ko: '한 곡' },
								value: 'track'
							}
						])
				);
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) return;
		const mode = interaction.options.getString('mode');

		if (mode == null) {
			const repeat = await this.container.guildService.getRepeat(interaction.guildId);
			await interaction.reply({
				components: [view.repeatCurrent({ mode: repeat })],
				flags: [MessageFlags.IsComponentsV2],
				allowedMentions: { users: [interaction.user.id], roles: [] }
			});
			return;
		}

		const VALID_REPEAT_MODES = ['off', 'track', 'queue'] as const;
		if (!VALID_REPEAT_MODES.includes(mode as (typeof VALID_REPEAT_MODES)[number])) {
			throw new UserError({
				identifier: 'repeat_invalid',
				message: '❌  잘못된 반복 모드 값이에요.',
				context: { mode }
			});
		}

		const repeatUpdated = await this.container.guildService.setRepeat(interaction.guildId, mode as RepeatMode);
		const player = this.container.audio.getPlayer(interaction.guildId);
		await player?.setRepeatMode(repeatUpdated);
		// 반복 모드는 클라이언트가 전이를 소유하므로 mixer 예열 슬롯을 비운다.
		if (player && repeatUpdated !== 'off') await this.container.mixerService.clearNext(player).catch(() => null);

		await interaction.reply({
			components: [view.repeatUpdated({ mode: repeatUpdated })],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { users: [interaction.user.id], roles: [] }
		});
	}
}
