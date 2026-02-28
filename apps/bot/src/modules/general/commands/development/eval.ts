import { ApplyOptions } from '@sapphire/decorators';
import { Command, RegisterBehavior } from '@sapphire/framework';
import {
	ActionRowBuilder,
	ApplicationIntegrationType,
	ChatInputCommandInteraction,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle
} from 'discord.js';
import { envParseArray } from '@skyra/env-utilities';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'eval',
	preconditions: ['OwnerOnly']
})
export class EvalCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand(
			(builder) => {
				builder
					.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
					.setName(this.name)
					.setDescription('코드를 실행해요. (봇 소유자 전용)');
			},
			{ guildIds: envParseArray('DEV_GUILD_IDS'), behaviorWhenNotIdentical: RegisterBehavior.Overwrite }
		);
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const modal = new ModalBuilder().setCustomId('eval-modal').setTitle('코드 실행');

		const codeInput = new TextInputBuilder()
			.setCustomId('eval-code')
			.setLabel('실행할 코드')
			.setStyle(TextInputStyle.Paragraph)
			.setPlaceholder('this.container.client.guilds.cache.size')
			.setRequired(true);

		modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(codeInput));

		await interaction.showModal(modal);
	}
}
