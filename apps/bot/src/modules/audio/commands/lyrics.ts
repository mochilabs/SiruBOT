import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationIntegrationType, ChatInputCommandInteraction, MessageFlags, TextDisplayBuilder } from 'discord.js';
import { createContainer } from '@sirubot/utils';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'lyrics',
	description: '곡의 가사를 검색해요.',
	fullCategory: ['음악'],
	preconditions: ['TextChannelAllowed', 'NodeAvailable', 'SongPlaying']
})
export class LyricsCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '가사' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '현재 재생 중인 곡 또는 검색한 곡의 가사를 보여줘요.' })
				.addStringOption((option) =>
					option
						.setName('query')
						.setDescription('Song title to search lyrics for (leave empty for current track)')
						.setNameLocalizations({ ko: '검색어' })
						.setDescriptionLocalizations({ ko: '가사를 검색할 곡 제목 (비우면 현재 재생곡)' })
						.setRequired(false)
				);
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) return;

		await interaction.deferReply();

		let query = interaction.options.getString('query');

		// If no query, try to use current playing track
		if (!query) {
			const player = this.container.audio.getPlayer(interaction.guildId);
			if (player?.queue.current) {
				const track = player.queue.current;
				query = `${track.info.author} ${track.info.title}`.replace(/\(.*?\)|\[.*?\]/g, '').trim();
			} else {
				await interaction.editReply({
					content: '❌ 검색어를 입력하거나 곡을 재생 중이어야 해요.'
				});
				return;
			}
		}

		try {
			// Use lrclib.net API (free, no key required)
			const encoded = encodeURIComponent(query);
			const response = await fetch(`https://lrclib.net/api/search?q=${encoded}`, {
				headers: { 'User-Agent': 'SiruBOT/1.0' }
			});

			if (!response.ok) {
				await interaction.editReply({ content: '❌ 가사를 검색하는 중 오류가 발생했어요.' });
				return;
			}

			const results = (await response.json()) as Array<{
				trackName: string;
				artistName: string;
				plainLyrics: string | null;
				syncedLyrics: string | null;
			}>;

			if (!results || results.length === 0 || (!results[0].plainLyrics && !results[0].syncedLyrics)) {
				await interaction.editReply({ content: `❌ **${query}**에 대한 가사를 찾을 수 없었어요.` });
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
		} catch {
			await interaction.editReply({ content: '❌ 가사를 검색하는 중 오류가 발생했어요.' });
		}
	}
}
