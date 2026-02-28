import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { settingsView } from '../view/settings.ts';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'settings',
	description: '봇의 서버 설정을 관리해요.',
	fullCategory: ['음악'],
	preconditions: ['ManageGuild']
})
export class SettingsCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '설정' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '봇의 서버 설정을 관리해요.' })
				.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) return;

		await interaction.deferReply();

		const guild = await this.container.guildService.getGuild(interaction.guildId);

		await interaction.editReply({
			components: [settingsView(guild, 'main')],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { roles: [], users: [] }
		});
	}
}
