import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction } from 'discord.js';
import { runHelpSession } from '../help/helpSession.ts';

/** `/도움말` — 카테고리 데이터는 `help/helpCatalog.ts`, 화면은 `views/help.ts`, 셀렉트 세션은 `help/helpSession.ts`예요. */
@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'help',
	description: 'Show the list of available commands.',
	fullCategory: ['일반']
})
export class HelpCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '도움말' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '사용 가능한 명령어 목록을 보여줘요.' });
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		await runHelpSession(interaction);
	}
}
