import { container, UserError } from '@sapphire/framework';
import { emoji, resolveYouTubeVideoId } from '@sirubot/utils';
import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { searchLyrics, searchLyricsForTrack } from '../../../../services/dataApiClient.ts';
import { LYRICS_BUTTON_IDS, lyricsView } from '../views/lyrics.ts';
import { buildLyricsText, hasTranslation, type LyricsViewMode } from '../utils/lyricsText.ts';
import { createComponentSession } from '../../../../lib/componentSession.ts';
import { errorView } from '../../../../lib/errorView.ts';

export const name = 'lyrics';
export const ko = '가사';
export const description = '가사를 검색해요.';
/** en-US 기본 설명 (기본 로케일이 영어예요) */
export const descriptionEn = 'Search the lyrics of a song.';
export const preconditions = ['TextChannelAllowed'];

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	return sub
		.setName(name)
		.setNameLocalizations({ ko })
		.setDescription(descriptionEn)
		.setDescriptionLocalizations({ ko: '현재 재생 중인 곡 또는 검색한 곡의 가사를 보여줘요.' })
		.addStringOption((option) =>
			option
				.setName('query')
				.setDescription('Song title to search lyrics for (leave empty for current track)')
				.setNameLocalizations({ ko: '검색어' })
				.setDescriptionLocalizations({ ko: '가사를 검색할 곡 제목 (비우면 현재 재생곡)' })
				.setRequired(false)
		);
}

export async function run(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
	await interaction.deferReply();

	let query = interaction.options.getString('query');
	let current: { title: string; artist: string; durationMs: number; sourceName: string | null; videoId: string | null } | null = null;

	if (!query) {
		const player = container.audio.getPlayer(interaction.guildId);
		if (player?.queue.current) {
			const track = player.queue.current;
			query = `${track.info.author} ${track.info.title}`.replace(/\(.*?\)|\[.*?\]/g, '').trim();
			current = {
				title: track.info.title,
				artist: track.info.author,
				durationMs: track.info.duration,
				sourceName: track.info.sourceName ?? null,
				videoId: resolveYouTubeVideoId(track)
			};
		} else {
			throw new UserError({
				identifier: 'lyrics_no_track',
				message: `${emoji('error')} 검색어를 입력하거나 곡을 재생 중이어야 해요.`,
				context: { ephemeral: true }
			});
		}
	}

	try {
		// 게이트웨이(data-api) 우선, 실패 시 lrclib 직접 호출로 폴백해요
		const results = current ? await searchLyricsForTrack(current).catch(() => searchLyrics(query)) : await searchLyrics(query);

		if (!results || results.length === 0 || (!results[0].plainLyrics && !results[0].syncedLyrics)) {
			await interaction.editReply({
				components: [errorView(`${emoji('error')} **${query}**에 대한 가사를 찾을 수 없었어요.`)],
				flags: [MessageFlags.IsComponentsV2]
			});
			return;
		}

		let result = results[0];
		let mode: LyricsViewMode = hasTranslation(result) ? 'both' : 'original';
		const render = (disabled = false) => {
			const translation = hasTranslation(result) ? 'ready' : result.translation?.status === 'pending' ? 'pending' : 'none';
			return {
				components: [lyricsView(result.trackName, result.artistName, buildLyricsText(result, mode), { translation, mode, disabled })],
				flags: [MessageFlags.IsComponentsV2 as const]
			};
		};

		const message = await interaction.editReply(render());
		if (!hasTranslation(result) && result.translation?.status !== 'pending') return;

		// 번역 보기 방식을 바꾸거나(ready), 준비 중인 번역을 다시 불러와요(pending)
		createComponentSession(message, {
			time: 10 * 60 * 1000,
			owner: { userId: interaction.user.id },
			logger: container.logger,
			onCollect: async (button) => {
				if (button.customId === LYRICS_BUTTON_IDS.refresh) {
					const refreshed = await searchLyrics(query!).catch(() => null);
					if (refreshed?.[0]) result = refreshed[0];
					if (hasTranslation(result)) mode = 'both';
				} else if (button.customId === LYRICS_BUTTON_IDS.original) mode = 'original';
				else if (button.customId === LYRICS_BUTTON_IDS.translation) mode = 'translation';
				else if (button.customId === LYRICS_BUTTON_IDS.both) mode = 'both';
				await button.update(render());
			},
			onTimeout: async () => {
				await interaction.editReply(render(true)).catch(() => null);
			}
		});
	} catch (error) {
		container.logger.error(`[lyrics] lyrics search failed (guild ${interaction.guildId}): ${error}`);
		throw new UserError({
			identifier: 'lyrics_search_failed',
			message: `${emoji('error')} 가사를 검색하는 중 오류가 발생했어요.`,
			context: { ephemeral: true }
		});
	}
}
