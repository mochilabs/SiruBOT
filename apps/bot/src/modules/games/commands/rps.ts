import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { rpsChoiceView } from '../view/rps.ts';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'rps',
	description: 'Play rock-paper-scissors against the bot.',
	fullCategory: ['게임']
})
export class RpsCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '가위바위보' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '가위바위보로 봇과 승부해요.' });
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		await interaction.reply({
			components: [rpsChoiceView(interaction.user.displayName)],
			flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
		});
	}
}
