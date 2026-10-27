import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction } from 'discord.js';
import { emoji } from '@sirubot/utils';
import { runSubcommandPreconditions, subcommandSummaries, type SubcommandModule } from '../../../lib/subcommandDispatcher.ts';
import * as bot from '../subcommands/bot.ts';
import * as server from '../subcommands/server.ts';

const SUBCOMMANDS: SubcommandModule[] = [bot, server];

/** /도움말에서 서브커맨드 멘션을 그릴 때 써요 */
export const INFO_SUBCOMMANDS = subcommandSummaries(SUBCOMMANDS);

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'info',
	description: 'Show bot, server, and user information.',
	fullCategory: ['일반']
})
export class InfoCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName('info')
				.setNameLocalizations({ ko: '정보' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '봇·서버·유저 정보를 보여줘요.' });

			for (const subcommand of SUBCOMMANDS) {
				builder.addSubcommand((sub) => subcommand.build(sub));
			}
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) {
			throw new UserError({
				identifier: 'info_not_in_guild',
				message: `${emoji('error')} 길드 안에서만 사용할 수 있어요.`,
				context: { ephemeral: true }
			});
		}

		const subcommandName = interaction.options.getSubcommand(true);
		const subcommand = SUBCOMMANDS.find((s) => s.name === subcommandName);
		if (!subcommand) {
			throw new UserError({
				identifier: 'info_unknown_subcommand',
				message: `${emoji('error')} 알 수 없는 하위 명령어예요.`,
				context: { ephemeral: true }
			});
		}

		await runSubcommandPreconditions(this, interaction, subcommand.preconditions);
		await subcommand.run(interaction);
	}
}
