import { ApplyOptions } from '@sapphire/decorators';
import { Command, RegisterBehavior } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction } from 'discord.js';
import { evalModal } from '../../view/eval.ts';
import { getConfig } from '../../../../lib/config.ts';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'eval',
	fullCategory: ['개발'],
	preconditions: ['OwnerOnly']
})
export class EvalCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand(
			(builder) => {
				builder
					.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
					.setName(this.name)
					.setNameLocalizations({ ko: '실행' })
					.setDescription('Evaluate code (bot owner only).')
					.setDescriptionLocalizations({ ko: '코드를 실행해요. (봇 소유자 전용)' });
			},
			{ guildIds: [...getConfig().discord.devGuildIds], behaviorWhenNotIdentical: RegisterBehavior.Overwrite }
		);
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		await interaction.showModal(evalModal());
	}
}
