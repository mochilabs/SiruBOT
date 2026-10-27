import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { emoji } from '@sirubot/utils';
import { ApplicationIntegrationType, AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';
import { runSubcommandPreconditions, subcommandSummaries, type SubcommandModule } from '../../../lib/subcommandDispatcher.ts';
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

const SUBCOMMANDS: SubcommandModule[] = [
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
export const MUSIC_SUBCOMMANDS = subcommandSummaries(SUBCOMMANDS);

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'music',
	description: 'Control music playback (play, pause, queue, filters).',
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
		// (하나의 명령어에 합치면서 union으로 걸면 /음악 가사 같은 가벼운 명령어까지 음성 채널을 요구하게 돼요)
		await runSubcommandPreconditions(this, interaction, subcommand.preconditions);

		await subcommand.run(interaction);
	}
}
