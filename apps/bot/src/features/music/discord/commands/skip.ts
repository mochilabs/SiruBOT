import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationIntegrationType, AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';
import { runSubcommandPreconditions } from '../../../../lib/subcommandDispatcher.ts';
import * as skip from '../subcommands/skip.ts';
import { musicMemberPreconditionError } from '../utils/preconditions.ts';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'skip',
	description: skip.description,
	fullCategory: ['음악']
})
export class SkipCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: skip.ko })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: skip.description });
			skip.withOptions(builder);
		});
	}

	public override async autocompleteRun(interaction: AutocompleteInteraction) {
		await skip.autocomplete(interaction);
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const error = musicMemberPreconditionError(interaction);
		if (error) throw error;

		const cached = interaction as ChatInputCommandInteraction<'cached'>;
		await runSubcommandPreconditions(this, cached, skip.preconditions);
		await skip.run(cached);
	}
}
