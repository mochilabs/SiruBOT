import { container, UserError } from '@sapphire/framework';
import { appEmoji } from '@sirubot/utils';
import { getSimpleYouTubeSuggestions } from '@sirubot/utils';
import { AutocompleteInteraction, ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from 'discord.js';
import { SearchPlatform } from 'lavalink-client';

export const name = 'play';
export const ko = '재생';
export const description = '음성 채널에서 노래를 재생해요.';
export const preconditions = [
	'TextChannelAllowed',
	'NodeAvailable',
	'VoiceConnected',
	'SameVoiceChannel',
	'MemberListenable',
	'ClientVoiceConnectable',
	'ClientVoiceSpeakable'
];

const VALID_PLATFORMS = ['ytsearch', 'scsearch', 'spsearch'] as const;

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	return sub
		.setName(name)
		.setNameLocalizations({ ko })
		.setDescription(description)
		.setDescriptionLocalizations({ ko: description })
		.addStringOption((option) =>
			option
				.setName('query')
				.setNameLocalizations({ ko: '검색어' })
				.setDescription('Enter the title or URL of the song you want to play.')
				.setDescriptionLocalizations({ ko: '재생할 노래의 제목이나 주소를 입력해주세요.' })
				.setAutocomplete(true)
				.setRequired(true)
		)
		.addStringOption((option) =>
			option
				.setName('platform')
				.setNameLocalizations({ ko: '플랫폼' })
				.setDescription('Select the platform to search for music.')
				.setDescriptionLocalizations({ ko: '노래를 찾을 플랫폼을 선택해주세요.' })
				.addChoices([
					{ name: 'youtube', name_localizations: { ko: '유튜브' }, value: 'ytsearch' },
					{ name: 'soundcloud', name_localizations: { ko: '사운드클라우드' }, value: 'scsearch' },
					{ name: 'spotify', name_localizations: { ko: '스포티파이' }, value: 'spsearch' }
				])
				.setRequired(false)
		);
}

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
	const focusedOption = interaction.options.getFocused(true);

	if (focusedOption.name === 'query') {
		const query = focusedOption.value;

		if (query.length < 2) {
			const defaultSuggestions = ['인기 음악', '최신 K-POP', '팝송 모음', '힙합 음악', '발라드 명곡', '일본 음악', '클래식 음악', '재즈 음악'];
			return interaction.respond(defaultSuggestions.map((suggestion) => ({ name: suggestion, value: suggestion })));
		}

		try {
			const suggestions = await getSimpleYouTubeSuggestions(query, 25);
			const autocompleteChoices = suggestions.slice(0, 25).map((suggestion) => ({
				name: suggestion.length > 100 ? suggestion.substring(0, 97) + '...' : suggestion,
				value: suggestion.length > 100 ? suggestion.substring(0, 100) : suggestion
			}));
			return interaction.respond(autocompleteChoices);
		} catch {
			const fallbackSuggestions = [query, `${query} 음악`, `${query} 노래`, `${query} 가사`, `${query} 플레이리스트`];
			return interaction.respond(fallbackSuggestions.map((suggestion) => ({ name: suggestion, value: suggestion })));
		}
	}

	return interaction.respond([]);
}

export async function run(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
	if (!interaction.member.voice.channelId) {
		throw new UserError({
			identifier: 'play_not_in_voice',
			message: `${appEmoji('error', '❌')} 먼저 음성 채널에 접속해주세요.`,
			context: { ephemeral: true }
		});
	}
	await interaction.deferReply();

	const voiceChannel = interaction.member.voice.channelId;
	const query = interaction.options.getString('query', true);
	const platformInput = interaction.options.getString('platform') || 'ytsearch';
	const platform: SearchPlatform = (VALID_PLATFORMS as readonly string[]).includes(platformInput) ? (platformInput as SearchPlatform) : 'ytsearch';
	const context = {
		command: name,
		query,
		platform,
		voiceChannelId: voiceChannel,
		textChannelId: interaction.channelId,
		guildId: interaction.guildId
	};

	const player = await container.audioService.getOrCreatePlayer(interaction.guildId, voiceChannel, interaction.channelId);
	const searchRes = await container.audioService.search(
		player,
		query,
		platform,
		{ id: interaction.user.id, username: interaction.user.username },
		context
	);

	await container.audioService.connectPlayer(player, context);

	switch (searchRes.loadType) {
		case 'playlist': {
			await container.audioService.handlePlaylistPlay(interaction, player, searchRes);
			break;
		}
		case 'track':
		case 'search': {
			await container.audioService.handleTrackPlay(interaction, player, searchRes);
			break;
		}
	}

	await container.audioService.ensurePlayback(player);
}
