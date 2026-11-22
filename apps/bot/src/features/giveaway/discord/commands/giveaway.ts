import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { ApplicationIntegrationType, type AutocompleteInteraction, type ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { emoji } from '@sirubot/utils';
import { runSubcommandPreconditions, subcommandSummaries, type SubcommandModule } from '../../../../lib/subcommandDispatcher.ts';
import * as cancel from '../subcommands/cancel.ts';
import * as end from '../subcommands/end.ts';
import * as reroll from '../subcommands/reroll.ts';
import * as start from '../subcommands/start.ts';

const SUBCOMMANDS: SubcommandModule[] = [start, reroll, end, cancel];

/** /도움말에서 서브커맨드 멘션을 그릴 때 써요 */
export const GIVEAWAY_SUBCOMMANDS = subcommandSummaries(SUBCOMMANDS);

/**
 * /기브어웨이 — 시작·다시뽑기·종료·취소 (서버 관리 권한; 서버가 연동 설정에서 다른 역할에 열어 줄 수 있어요).
 * 참여는 카드의 버튼으로 하고, 마감은 예약 작업(giveaway_end)이 처리해요.
 */
@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'giveaway',
	description: 'Run giveaways with custom entry conditions.',
	fullCategory: ['일반']
})
export class GiveawayCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
				.setName('giveaway')
				.setNameLocalizations({ ko: '기브어웨이' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '참여 조건을 직접 정하는 기브어웨이를 열어요.' });

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
				identifier: 'giveaway_not_in_guild',
				message: `${emoji('error')} 서버 안에서만 사용할 수 있어요.`,
				context: { ephemeral: true }
			});
		}
		const subcommand = SUBCOMMANDS.find((s) => s.name === interaction.options.getSubcommand(true));
		if (!subcommand) {
			throw new UserError({
				identifier: 'giveaway_unknown_subcommand',
				message: `${emoji('error')} 알 수 없는 하위 명령어예요.`,
				context: { ephemeral: true }
			});
		}
		await runSubcommandPreconditions(this, interaction, subcommand.preconditions);
		await subcommand.run(interaction);
	}
}
