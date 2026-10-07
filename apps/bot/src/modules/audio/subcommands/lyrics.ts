import { container, UserError } from '@sapphire/framework';
import { createContainer } from '@sirubot/utils';
import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder, TextDisplayBuilder } from 'discord.js';
import { searchLyrics } from '../../../services/dataApiClient.ts';
import { errorView } from '../view/error.ts';

export const name = 'lyrics';
export const ko = '가사';
export const description = '곡의 가사를 검색해요.';
export const preconditions = ['TextChannelAllowed', 'NodeAvailable', 'SongPlaying'];

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	return sub
		.setName(name)
		.setNameLocalizations({ ko })
		.setDescription(description)
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

	// If no query, try to use current playing track
	if (!query) {
		const player = container.audio.getPlayer(interaction.guildId);
		if (player?.queue.current) {
			const track = player.queue.current;
			query = `${track.info.author} ${track.info.title}`.replace(/\(.*?\)|\[.*?\]/g, '').trim();
		} else {
			throw new UserError({
				identifier: 'lyrics_no_track',
				message: '❌ 검색어를 입력하거나 곡을 재생 중이어야 해요.',
				context: { ephemeral: true }
			});
		}
	}

	try {
		// 게이트웨이(data-api) 우선, 실패 시 lrclib 직접 호출로 폴백해요
		const results = await searchLyrics(query);

		if (!results || results.length === 0 || (!results[0].plainLyrics && !results[0].syncedLyrics)) {
			await interaction.editReply({
				components: [errorView(`❌ **${query}**에 대한 가사를 찾을 수 없었어요.`)],
				flags: [MessageFlags.IsComponentsV2]
			});
			return;
		}

		const result = results[0];
		let lyrics = result.plainLyrics ?? result.syncedLyrics ?? '';

		// Strip synced lyrics timestamps if using synced
		if (!result.plainLyrics && result.syncedLyrics) {
			lyrics = lyrics.replace(/\[\d{2}:\d{2}\.\d{2,3}\]\s*/g, '');
		}

		// Truncate if too long (Discord limit)
		const maxLength = 3800;
		if (lyrics.length > maxLength) {
			lyrics = lyrics.substring(0, maxLength) + '\n\n*... (가사가 너무 길어 잘렸어요)*';
		}

		const containerComponent = createContainer();
		containerComponent.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`### 🎶 ${result.trackName} — ${result.artistName}\n\n${lyrics}`)
		);

		await interaction.editReply({
			components: [containerComponent],
			flags: [MessageFlags.IsComponentsV2]
		});
	} catch (error) {
		container.logger.error(`[lyrics] lyrics search failed (guild ${interaction.guildId}): ${error}`);
		throw new UserError({
			identifier: 'lyrics_search_failed',
			message: '❌ 가사를 검색하는 중 오류가 발생했어요.',
			context: { ephemeral: true }
		});
	}
}
