import { container, UserError } from '@sapphire/framework';
import { getSimpleYouTubeSuggestions } from '@sirubot/utils';
import {
	AutocompleteInteraction,
	ChatInputCommandInteraction,
	ComponentType,
	Message,
	MessageFlags,
	SlashCommandSubcommandBuilder,
	StringSelectMenuInteraction
} from 'discord.js';
import { Player, SearchPlatform, SearchResult, UnresolvedSearchResult } from 'lavalink-client';
import * as view from '../view/search.ts';
import { errorView } from '../view/error.ts';

export const name = 'search';
export const ko = '검색';
export const description = '곡을 검색해서 5개 결과 중 골라 재생해요.';
export const preconditions = [
	'TextChannelAllowed',
	'NodeAvailable',
	'VoiceConnected',
	'SameVoiceChannel',
	'MemberListenable',
	'ClientVoiceConnectable',
	'ClientVoiceSpeakable'
];

const RESULT_LIMIT = 5;
const SELECT_TIMEOUT_MS = 30_000;
const VALID_PLATFORMS = ['ytsearch', 'scsearch', 'spsearch'] as const;

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	return sub
		.setName(name)
		.setNameLocalizations({ ko, 'en-US': 'search' })
		.setDescription(description)
		.setDescriptionLocalizations({ ko: '곡을 검색해서 5개 결과 중 골라 재생합니다.' })
		.addStringOption((option) =>
			option
				.setName('query')
				.setNameLocalizations({ ko: '검색어' })
				.setDescription('Enter the keyword to search for.')
				.setDescriptionLocalizations({ ko: '검색할 노래 제목이나 키워드를 입력해주세요.' })
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
	const focused = interaction.options.getFocused(true);
	if (focused.name !== 'query') return interaction.respond([]);

	const query = focused.value;
	if (query.length < 2) {
		return interaction.respond([
			{ name: '인기 음악', value: '인기 음악' },
			{ name: '최신 K-POP', value: '최신 K-POP' },
			{ name: '팝송 모음', value: '팝송 모음' }
		]);
	}

	try {
		const suggestions = await getSimpleYouTubeSuggestions(query, 25);
		return interaction.respond(
			suggestions.slice(0, 25).map((suggestion) => ({
				name: suggestion.length > 100 ? suggestion.slice(0, 97) + '...' : suggestion,
				value: suggestion.length > 100 ? suggestion.slice(0, 100) : suggestion
			}))
		);
	} catch {
		return interaction.respond([{ name: query, value: query }]);
	}
}

/** 셀렉트 메뉴 30초 수집 — 선택 시 첫 재생 흐름(handleTrackPlay)을 그대로 태운다. */
async function runSelection(
	interaction: ChatInputCommandInteraction<'cached'>,
	player: Player,
	tracks: (SearchResult | UnresolvedSearchResult)['tracks'],
	selectMessage: Message
): Promise<void> {
	const collector = selectMessage.createMessageComponentCollector({
		filter: (i) => i.user.id === interaction.user.id && i.customId === view.searchSelectCustomId,
		componentType: ComponentType.StringSelect,
		time: SELECT_TIMEOUT_MS
	});

	const handleTimeout = async () => {
		await interaction
			.editReply({
				components: [view.searchTimeout()],
				flags: [MessageFlags.IsComponentsV2],
				allowedMentions: { users: [], roles: [] }
			})
			.catch(() => null);
	};

	const handleSelect = async (selectInteraction: StringSelectMenuInteraction<'cached'>) => {
		await selectInteraction.deferUpdate();
		collector.off('collect', handleSelect);
		collector.off('end', handleTimeout);

		const index = Number.parseInt(selectInteraction.values[0], 10);
		const selected = tracks[index];
		if (!selected) {
			await interaction.editReply({ components: [view.searchTimeout()], flags: [MessageFlags.IsComponentsV2] }).catch(() => null);
			return;
		}

		try {
			// 선택한 1곡을 재생 흐름에 그대로 넣는다 (추가·예열·컨트롤러·피드백 일괄 처리).
			const singleRes = { loadType: 'track', playlist: null, tracks: [selected] } as unknown as SearchResult;
			await container.audioService.handleTrackPlay(interaction, player, singleRes);
			await container.audioService.ensurePlayback(player);
		} catch (error) {
			container.logger.error(`[search] failed to play selected track (guild ${interaction.guildId}): ${error}`);
			await interaction
				.editReply({
					components: [errorView('❌ 선택한 곡을 재생하지 못했어요. 다시 /음악 검색 을 시도해 주세요.')],
					flags: [MessageFlags.IsComponentsV2],
					allowedMentions: { users: [], roles: [] }
				})
				.catch(() => null);
		}
	};

	collector.once('collect', handleSelect);
	collector.once('end', handleTimeout);
}

export async function run(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
	const voiceChannel = interaction.member.voice.channelId;
	if (!voiceChannel) {
		throw new UserError({
			identifier: 'search_not_in_voice',
			message: '❌ 먼저 음성 채널에 접속해주세요.',
			context: { ephemeral: true }
		});
	}

	// 검색(Lavalink REST)은 네트워크 왕복이므로 3초 응답 제한 전에 defer한다.
	await interaction.deferReply();

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

	const tracks = searchRes.tracks.slice(0, RESULT_LIMIT);
	if (tracks.length === 0) {
		await interaction.editReply({
			components: [errorView('🔎 검색 결과가 없어요. 다른 검색어로 다시 시도해 주세요.')],
			flags: [MessageFlags.IsComponentsV2]
		});
		return;
	}

	await container.audioService.connectPlayer(player, context);

	const selectMessage = await interaction.editReply({
		components: [view.searchResults(query, tracks)],
		flags: [MessageFlags.IsComponentsV2],
		allowedMentions: { users: [], roles: [] }
	});

	await runSelection(interaction, player, tracks, selectMessage);
}
