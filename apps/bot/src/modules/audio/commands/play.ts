import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { getSimpleYouTubeSuggestions } from '@sirubot/utils';
import { ApplicationIntegrationType, AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';
import { SearchPlatform } from 'lavalink-client';

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'play',
	description: '음성 채널에서 노래를 재생해요.',
	fullCategory: ['음악'],
	preconditions: [
		'TextChannelAllowed',
		'NodeAvailable',
		'VoiceConnected',
		'SameVoiceChannel',
		'MemberListenable',
		'ClientVoiceConnectable',
		'ClientVoiceSpeakable'
	]
})
export class PlayCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName('play')
				.setNameLocalizations({
					ko: '재생',
					'en-US': 'play'
				})
				.setDescription(this.description)
				.setDescriptionLocalizations({
					ko: '음성 채널에서 노래를 재생해요.'
				})
				.addStringOption((option) =>
					option
						.setName('query')
						.setNameLocalizations({
							ko: '검색어'
						})
						.setDescription('Enter the title or URL of the song you want to play.')
						.setDescriptionLocalizations({
							ko: '재생할 노래의 제목이나 주소를 입력해주세요.'
						})
						.setAutocomplete(true)
						.setRequired(true)
				)
				.addStringOption((option) =>
					option
						.setName('platform')
						.setNameLocalizations({
							ko: '플랫폼'
						})
						.setDescription('Select the platform to search for music.')
						.setDescriptionLocalizations({
							ko: '노래를 찾을 플랫폼을 선택해주세요.'
						})
						.addChoices([
							{
								name: 'youtube',
								name_localizations: {
									ko: '유튜브'
								},
								value: 'ytsearch'
							},
							{
								name: 'soundcloud',
								name_localizations: {
									ko: '사운드클라우드'
								},
								value: 'scsearch'
							},
							{
								name: 'spotify',
								name_localizations: {
									ko: '스포티파이'
								},
								value: 'spsearch'
							}
						])
						.setRequired(false)
				);
		});
	}

	public override async autocompleteRun(interaction: AutocompleteInteraction) {
		const focusedOption = interaction.options.getFocused(true);

		if (focusedOption.name === 'query') {
			const query = focusedOption.value;

			// 쿼리가 너무 짧으면 기본 추천어 제공
			if (query.length < 2) {
				const defaultSuggestions = [
					'인기 음악',
					'최신 K-POP',
					'팝송 모음',
					'힙합 음악',
					'발라드 명곡',
					'일본 음악',
					'클래식 음악',
					'재즈 음악'
				];

				return interaction.respond(
					defaultSuggestions.map((suggestion) => ({
						name: suggestion,
						value: suggestion
					}))
				);
			}

			try {
				// Get suggestions
				const suggestions = await getSimpleYouTubeSuggestions(query, 25);

				// Respond with Discord autocomplete limit(25)
				const autocompleteChoices = suggestions.slice(0, 25).map((suggestion) => ({
					name: suggestion.length > 100 ? suggestion.substring(0, 97) + '...' : suggestion,
					value: suggestion.length > 100 ? suggestion.substring(0, 100) : suggestion
				}));

				return interaction.respond(autocompleteChoices);
			} catch (error) {
				// When error occurs, provide fallback suggestions
				const fallbackSuggestions = [query, `${query} 음악`, `${query} 노래`, `${query} 가사`, `${query} 플레이리스트`];

				return interaction.respond(
					fallbackSuggestions.map((suggestion) => ({
						name: suggestion.length > 100 ? suggestion.substring(0, 97) + '...' : suggestion,
						value: suggestion.length > 100 ? suggestion.substring(0, 100) : suggestion
					}))
				);
			}
		}

		return interaction.respond([]);
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) return;
		if (!interaction.member.voice.channelId) return;
		await interaction.deferReply();

		const voiceChannel = interaction.member.voice.channelId;
		const query = interaction.options.getString('query', true);
		const platform = (interaction.options.getString('platform') || 'ytsearch') as SearchPlatform;
		const context = {
			command: this.name,
			query,
			platform,
			voiceChannelId: voiceChannel,
			textChannelId: interaction.channelId,
			guildId: interaction.guildId
		};

		const player = await this.container.audioService.getOrCreatePlayer(interaction.guildId, voiceChannel, interaction.channelId);

		const searchRes = await this.container.audioService.search(
			player,
			query,
			platform,
			{ id: interaction.user.id, username: interaction.user.username },
			context
		);

		await this.container.audioService.connectPlayer(player, context);

		switch (searchRes.loadType) {
			case 'playlist': {
				await this.container.audioService.handlePlaylistPlay(interaction, player, searchRes);
				break;
			}
			case 'track':
			case 'search': {
				await this.container.audioService.handleTrackPlay(interaction, player, searchRes);
				break;
			}
		}

		await this.container.audioService.ensurePlayback(player);
	}
}
