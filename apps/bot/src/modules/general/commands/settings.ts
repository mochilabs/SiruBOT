import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { settingsView } from '../../audio/view/settings.ts';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'settings',
	description: '봇의 서버 설정을 관리해요.',
	fullCategory: ['일반'],
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
		if (!interaction.inCachedGuild()) {
			throw new UserError({
				identifier: 'settings_not_in_guild',
				message: '❌ 길드 안에서만 사용할 수 있어요.',
				context: { ephemeral: true }
			});
		}

		await interaction.deferReply();

		const guild = await this.container.guildService.getGuild(interaction.guildId);

		await interaction.editReply({
			components: [settingsView(guild, 'main')],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { roles: [], users: [] }
		});
	}
}
