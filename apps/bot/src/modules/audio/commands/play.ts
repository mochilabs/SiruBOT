import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationIntegrationType, AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';
import { runSubcommandPreconditions } from '../../../lib/subcommandDispatcher.ts';
import * as play from '../subcommands/play.ts';
import { musicMemberPreconditionError } from '../utils/preconditions.ts';

/**
 * `/재생` — `/음악 재생`의 1급 승격. 실사용 빈도가 가장 높은 재생만 top-level로 두고,
 * 나머지 제어는 `/음악`에 남겨요(같은 서브커맨드 모듈을 그대로 재사용).
 */
@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'play',
	description: play.description,
	fullCategory: ['음악']
})
export class PlayCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: play.ko })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: play.description });
			play.withOptions(builder);
		});
	}

	public override async autocompleteRun(interaction: AutocompleteInteraction) {
		await play.autocomplete(interaction);
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const error = musicMemberPreconditionError(interaction);
		if (error) throw error;

		const cached = interaction as ChatInputCommandInteraction<'cached'>;
		await runSubcommandPreconditions(this, cached, play.preconditions);
		await play.run(cached);
	}
}
