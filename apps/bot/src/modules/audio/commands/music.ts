import { ApplyOptions } from '@sapphire/decorators';
import { Command, PreconditionContainerArray, UserError, type SimplePreconditionKeys } from '@sapphire/framework';
import { emoji } from '@sirubot/utils';
import { ApplicationIntegrationType, AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';
import * as autoplay from '../subcommands/autoplay.ts';
import * as filter from '../subcommands/filter.ts';
import * as history from '../subcommands/history.ts';
import * as lyrics from '../subcommands/lyrics.ts';
import * as pause from '../subcommands/pause.ts';
import * as play from '../subcommands/play.ts';
import * as previous from '../subcommands/previous.ts';
import * as recommend from '../subcommands/recommend.ts';
import * as repeat from '../subcommands/repeat.ts';
import * as search from '../subcommands/search.ts';
import * as seek from '../subcommands/seek.ts';
import * as skip from '../subcommands/skip.ts';
import * as stop from '../subcommands/stop.ts';
import * as tts from '../subcommands/tts.ts';
import * as volume from '../subcommands/volume.ts';

/** 서브커맨드 모듈들의 공통 형태 */
interface MusicSubcommandModule {
	name: string;
	ko: string;
	description: string;
	preconditions: string[];
	build(sub: Parameters<typeof play.build>[0]): ReturnType<typeof play.build>;
	run(interaction: ChatInputCommandInteraction<'cached'>): Promise<unknown>;
	autocomplete?(interaction: AutocompleteInteraction): Promise<unknown>;
}

const SUBCOMMANDS: MusicSubcommandModule[] = [
	play,
	pause,
	skip,
	stop,
	previous,
	seek,
	volume,
	repeat,
	filter,
	search,
	lyrics,
	recommend,
	autoplay,
	tts,
	history
];

/** /도움말에서 서브커맨드 멘션을 그릴 때 써요 */
export const MUSIC_SUBCOMMANDS = SUBCOMMANDS.map(({ name, ko, description }) => ({ name, ko, description }));

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'music',
	description: '음악 재생을 제어해요.',
	fullCategory: ['음악']
})
export class MusicCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName('music')
				.setNameLocalizations({ ko: '음악' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '음악 재생을 제어해요.' });

			for (const subcommand of SUBCOMMANDS) {
				builder.addSubcommand((sub) => subcommand.build(sub));
			}
		});
	}

	public override async autocompleteRun(interaction: AutocompleteInteraction) {
		try {
			const subcommandName = interaction.options.getSubcommand();
			const subcommand = SUBCOMMANDS.find((s) => s.name === subcommandName);
			if (subcommand?.autocomplete) return subcommand.autocomplete(interaction);
		} catch {
			// 서브커맨드 파싱 실패 시 빈 응답
		}
		return interaction.respond([]);
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) {
			throw new UserError({
				identifier: 'music_not_in_guild',
				message: `${emoji('error')} 길드 안에서만 사용할 수 있어요.`,
				context: { ephemeral: true }
			});
		}

		const subcommandName = interaction.options.getSubcommand(true);
		const subcommand = SUBCOMMANDS.find((s) => s.name === subcommandName);
		if (!subcommand) {
			throw new UserError({
				identifier: 'music_unknown_subcommand',
				message: `${emoji('error')} 알 수 없는 하위 명령어예요.`,
				context: { ephemeral: true }
			});
		}

		// 기존에는 명령어마다 달랐던 precondition을 서브커맨드별로 실행해요.
		// (하나의 명령어에 합치면서 union으로 걸면 /음악 가사 같은 가벼운 명령어까지 음성채널을 요구하게 돼요)
		await this.runSubcommandPreconditions(interaction, subcommand);

		await subcommand.run(interaction);
	}

	private async runSubcommandPreconditions(interaction: ChatInputCommandInteraction<'cached'>, subcommand: MusicSubcommandModule): Promise<void> {
		// 프레임워크와 같은 방식으로 실행 — 없는 precondition/핸들러도 표준 에러로 처리돼요
		const result = await new PreconditionContainerArray(subcommand.preconditions as SimplePreconditionKeys[]).chatInputRun(interaction, this);
		if (result.isErr()) throw result.unwrapErr();
	}
}
