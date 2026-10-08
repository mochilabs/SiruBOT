import { container, UserError } from '@sapphire/framework';
import { appEmoji, createContainer, EMOJI_SPARKLE } from '@sirubot/utils';
import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder, TextDisplayBuilder } from 'discord.js';
import { addManualRecommendation, getInFlightRelatedFetch } from '../lavalink/autoPlayRelated.ts';
import { CustomPlayer } from '../lavalink/player/customPlayer.ts';
import { errorView } from '../view/error.ts';

export const name = 'recommend';
export const ko = '추천';
export const description = '현재 곡 기반의 추천곡을 대기열에 추가해요.';
export const preconditions = ['TextChannelAllowed', 'NodeAvailable', 'SongPlaying', 'DJOrAlone'];

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	return sub
		.setName(name)
		.setNameLocalizations({ ko })
		.setDescription(description)
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
}

export async function run(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
	const player = container.audio.getPlayer(interaction.guildId) as CustomPlayer | undefined;
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
			components: [
				errorView(
					`${appEmoji('error', '❌')} **${current.info.title}** 기준의 추천곡을 찾지 못했어요. 같은 소스(Youtube) 곡일 때만 동작해요.`
				)
			],
			flags: [MessageFlags.IsComponentsV2]
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
	container.playerNotifier.updateController(player);
}
