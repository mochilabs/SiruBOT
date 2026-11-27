import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { ApplicationIntegrationType, type AutocompleteInteraction, type ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { emoji } from '@sirubot/utils';
import { runSubcommandPreconditions, subcommandSummaries, type SubcommandModule } from '../../../../lib/subcommandDispatcher.ts';
import * as create from '../subcommands/create.ts';
import * as del from '../subcommands/delete.ts';
import * as list from '../subcommands/list.ts';

const SUBCOMMANDS: SubcommandModule[] = [create, list, del];

export const ANNOUNCE_SUBCOMMANDS = subcommandSummaries(SUBCOMMANDS);

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'announce',
	description: 'Schedule messages to be sent to a channel.',
	fullCategory: ['일반']
})
export class AnnounceCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
				.setName('announce')
				.setNameLocalizations({ ko: '공지' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '정해진 시각에 채널로 메시지를 보내도록 예약해요.' });

			for (const subcommand of SUBCOMMANDS) {
				builder.addSubcommand((sub) => subcommand.build(sub));
			}
		});
	}

	public override async autocompleteRun(interaction: AutocompleteInteraction) {
		const subcommand = SUBCOMMANDS.find((s) => s.name === interaction.options.getSubcommand(false));
		if (!subcommand?.autocomplete) return interaction.respond([]);
		await subcommand.autocomplete(interaction);
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) {
			throw new UserError({
				identifier: 'announce_not_in_guild',
				message: `${emoji('error')} 서버 안에서만 사용할 수 있어요.`,
				context: { ephemeral: true }
			});
		}
		const subcommand = SUBCOMMANDS.find((s) => s.name === interaction.options.getSubcommand(true));
		if (!subcommand) {
			throw new UserError({
				identifier: 'announce_unknown_subcommand',
				message: `${emoji('error')} 알 수 없는 하위 명령어예요.`,
				context: { ephemeral: true }
			});
		}
		await runSubcommandPreconditions(this, interaction, subcommand.preconditions);
		await subcommand.run(interaction);
	}
}
