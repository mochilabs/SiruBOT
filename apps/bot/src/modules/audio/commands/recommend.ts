import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags, TextDisplayBuilder } from 'discord.js';
import { createContainer, EMOJI_SPARKLE } from '@sirubot/utils';
import { addManualRecommendation, getInFlightRelatedFetch } from '../lavalink/autoPlayRelated.ts';
import { CustomPlayer } from '../lavalink/player/customPlayer.ts';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'recommend',
	description: '현재 곡 기반의 추천곡을 대기열에 추가해요.',
	fullCategory: ['음악'],
	preconditions: ['TextChannelAllowed', 'NodeAvailable', 'SongPlaying', 'DJOrAlone']
})
export class RecommendCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '추천' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '현재 재생 중인 곡과 비슷한 추천곡을 대기열에 추가합니다.' })
				.addIntegerOption((option) =>
					option
						.setName('count')
						.setNameLocalizations({ ko: '개수' })
						.setDescription('How many recommendations to add')
						.setDescriptionLocalizations({ ko: '추가할 추천곡 개수 (1~5)' })
						.setRequired(false)
						.setMinValue(1)
						.setMaxValue(5)
				);
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) return;

		const player = this.container.audio.getPlayer(interaction.guildId) as CustomPlayer | undefined;
		const current = player?.queue.current;
		if (!player || !current) {
			throw new UserError({
				identifier: 'RecommendCommandNoPlayer',
				message: '현재 재생 중인 곡이 없어요.',
				context: { ephemeral: true }
			});
		}

		if (getInFlightRelatedFetch(interaction.guildId)) {
			throw new UserError({
				identifier: 'RecommendCommandBusy',
				message: '추천곡을 이미 준비 중이에요. 잠시 후 다시 시도해요.',
				context: { ephemeral: true }
			});
		}

		const count = interaction.options.getInteger('count') ?? 1;

		// 추천곡 검색은 YouTube RD 플레이리스트 조회라 네트워크 왕복이 필요하다.
		await interaction.deferReply();

		const added = await addManualRecommendation(player, current, count);

		if (added.length === 0) {
			await interaction.editReply({
				content: `❌ **${current.info.title}** 기준의 추천곡을 찾지 못했어요. 같은 소스(Youtube) 곡일 때만 동작해요.`
			});
			return;
		}

		const listLines = added.map((track, index) => `${index + 1}. **${track.info.title}**`);
		const containerComponent = createContainer();
		containerComponent.addTextDisplayComponents(
			new TextDisplayBuilder().setContent([`${EMOJI_SPARKLE} 추천곡 **${added.length}곡**을 대기열에 추가했어요.`, ...listLines].join('\n'))
		);

		await interaction.editReply({
			components: [containerComponent],
			flags: [MessageFlags.IsComponentsV2],
			allowedMentions: { users: [], roles: [] }
		});
		// 대기열이 바뀌었으므로 컨트롤러도 갱신한다.
		this.container.playerNotifier.updateController(player);
	}
}
