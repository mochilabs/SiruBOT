import { ApplyOptions } from '@sapphire/decorators';
import { Command, PreconditionContainerArray, UserError, type SimplePreconditionKeys } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction } from 'discord.js';
import * as avatar from '../subcommands/avatar.ts';
import * as bot from '../subcommands/bot.ts';
import * as server from '../subcommands/server.ts';

interface InfoSubcommandModule {
	name: string;
	ko: string;
	description: string;
	preconditions: string[];
	build(sub: Parameters<typeof bot.build>[0]): ReturnType<typeof bot.build>;
	run(interaction: ChatInputCommandInteraction<'cached'>): Promise<unknown>;
}

const SUBCOMMANDS: InfoSubcommandModule[] = [bot, server, avatar];

/** /도움말에서 서브커맨드 멘션을 그릴 때 써요 */
export const INFO_SUBCOMMANDS = SUBCOMMANDS.map(({ name, ko, description }) => ({ name, ko, description }));

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'info',
	description: '봇·서버·유저 정보를 보여줘요.',
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
				message: '❌ 길드 안에서만 사용할 수 있어요.',
				context: { ephemeral: true }
			});
		}

		const subcommandName = interaction.options.getSubcommand(true);
		const subcommand = SUBCOMMANDS.find((s) => s.name === subcommandName);
		if (!subcommand) {
			throw new UserError({
				identifier: 'info_unknown_subcommand',
				message: '❌ 알 수 없는 하위 명령어예요.',
				context: { ephemeral: true }
			});
		}

		await this.runSubcommandPreconditions(interaction, subcommand);
		await subcommand.run(interaction);
	}

	private async runSubcommandPreconditions(interaction: ChatInputCommandInteraction<'cached'>, subcommand: InfoSubcommandModule): Promise<void> {
		// 프레임워크와 같은 방식으로 실행 — 없는 precondition/핸들러도 표준 에러로 처리돼요
		const result = await new PreconditionContainerArray(subcommand.preconditions as SimplePreconditionKeys[]).chatInputRun(interaction, this);
		if (result.isErr()) throw result.unwrapErr();
	}
}
