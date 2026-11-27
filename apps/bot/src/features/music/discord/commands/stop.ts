import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction } from 'discord.js';
import { runSubcommandPreconditions } from '../../../../lib/subcommandDispatcher.ts';
import * as stop from '../subcommands/stop.ts';
import { musicMemberPreconditionError } from '../utils/preconditions.ts';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'stop',
	description: stop.description,
	fullCategory: ['음악']
})
export class StopCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: stop.ko })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: stop.description });
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const error = musicMemberPreconditionError(interaction);
		if (error) throw error;

		const cached = interaction as ChatInputCommandInteraction<'cached'>;
		await runSubcommandPreconditions(this, cached, stop.preconditions);
		await stop.run(cached);
	}
}
