import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import * as view from '../view/repeat.ts';
import { RepeatMode } from 'lavalink-client';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'repeat',
	description: 'Set the repeat mode.',
	preconditions: ['DJRole', 'NodeAvailable']
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

		if (mode !== 'off' && mode !== 'track' && mode !== 'queue') {
			throw new UserError({
				identifier: 'repeat_invalid',
				message: '❌  잘못된 반복 모드 값이에요.',
				context: { mode }
			});
		}

		const repeatUpdated = await this.container.guildService.setRepeat(interaction.guildId, mode as RepeatMode);
		await this.container.audio.getPlayer(interaction.guildId)?.setRepeatMode(repeatUpdated);

		await interaction.reply({
			components: [view.repeatUpdated({ mode: repeatUpdated })],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { users: [interaction.user.id], roles: [] }
		});
	}
}
