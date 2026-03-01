import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import * as view from '../view/related.ts';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'related',
	description: '추천곡 자동재생을 켜거나 꺼요.',
	fullCategory: ['음악'],
	preconditions: ['TextChannelAllowed', 'NodeAvailable', 'SongPlaying', 'DJOrAlone']
})
export class RelatedCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setDescription(this.description)
				.setNameLocalizations({ ko: '추천곡' })
				.setDescriptionLocalizations({ ko: '추천곡 자동재생을 켜거나 끕니다.' })
				.addBooleanOption((option) =>
					option
						.setName('enabled')
						.setNameLocalizations({ ko: '사용' })
						.setDescription('Enable or disable autoplay of related tracks')
						.setDescriptionLocalizations({ ko: '추천곡 자동재생을 켜거나 끕니다.' })
				);
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) return;

		await interaction.deferReply();

		const enabled = interaction.options.getBoolean('enabled');
		if (enabled === null) {
			const current = await this.container.guildService.getRelated(interaction.guildId);
			await interaction.editReply({
				components: [view.relatedCurrent(current)],
				flags: [MessageFlags.IsComponentsV2],
				allowedMentions: { users: [interaction.user.id], roles: [] }
			});
			return;
		}

		const updated = await this.container.guildService.setRelated(interaction.guildId, enabled);
		await interaction.editReply({
			components: [view.relatedUpdated(updated)],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { users: [interaction.user.id], roles: [] }
		});
	}
}
