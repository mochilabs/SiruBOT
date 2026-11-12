import { container } from '@sapphire/framework';
import { emoji } from '@sirubot/utils';
import { getSimpleYouTubeSuggestions } from '../../../../services/dataApiClient.ts';
import {
	AutocompleteInteraction,
	ButtonInteraction,
	ChatInputCommandInteraction,
	Message,
	MessageFlags,
	SlashCommandSubcommandBuilder,
	StringSelectMenuInteraction
} from 'discord.js';
import { Player, SearchPlatform, Track, UnresolvedTrack } from 'lavalink-client';
import * as view from '../views/search.ts';
import { createComponentSession, type ComponentSession } from '../../../../lib/componentSession.ts';
import { errorView } from '../../../../lib/errorView.ts';
import { actorFromMember } from '../../application/actor.ts';
import { editTrackPlayReply } from '../utils/playFeedback.ts';

export const name = 'search';
export const ko = '검색';
export const description = '곡을 검색해서 5개 결과 중 골라 재생해요.';
/** en-US 기본 설명 (기본 로케일이 영어예요) */
export const descriptionEn = 'Search tracks and pick one of five results to play.';
/** 음성 채널 조건(봇과 같은 채널, 원격 권한자 예외)은 음악 유스케이스가 판정해요. */
export const preconditions = ['TextChannelAllowed', 'NodeAvailable', 'MemberListenable'];

const RESULT_LIMIT = 5;
const SELECT_TIMEOUT_MS = 30_000;
const VALID_PLATFORMS = ['ytsearch', 'scsearch', 'spsearch'] as const;

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	return sub
		.setName(name)
		.setNameLocalizations({ ko })
		.setDescription(descriptionEn)
		.setDescriptionLocalizations({ ko: '곡을 검색해서 5개 결과 중 골라 재생해요.' })
		.addStringOption((option) =>
			option
				.setName('query')
				.setNameLocalizations({ ko: '검색어' })
				.setDescription('Enter the keyword to search for.')
				.setDescriptionLocalizations({ ko: '검색할 노래 제목이나 키워드를 입력해 주세요.' })
				.setAutocomplete(true)
				.setRequired(true)
		)
		.addStringOption((option) =>
			option
				.setName('platform')
				.setNameLocalizations({ ko: '플랫폼' })
				.setDescription('Select the platform to search for music.')
				.setDescriptionLocalizations({ ko: '노래를 찾을 플랫폼을 선택해 주세요.' })
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

/** 셀렉트 메뉴 30초 수집 — 선택한 곡은 유스케이스의 대기열 추가와 재생 보장을 그대로 태운다. */
async function runSelection(
	interaction: ChatInputCommandInteraction<'cached'>,
	player: Player,
	tracks: (Track | UnresolvedTrack)[],
	selectMessage: Message
): Promise<void> {
	const handleTimeout = async () => {
		await interaction
			.editReply({
				components: [view.searchTimeout()],
				flags: [MessageFlags.IsComponentsV2],
				allowedMentions: { users: [], roles: [] }
			})
			.catch(() => null);
	};

	const handleCancel = async (collected: ButtonInteraction<'cached'>, session: ComponentSession) => {
		if (!session.settle('cancel')) return;
		await collected
			.update({
				components: [view.searchCancelled()],
				flags: [MessageFlags.IsComponentsV2],
				allowedMentions: { users: [], roles: [] }
			})
			.catch(() => null);
	};

	const handleSelect = async (selectInteraction: StringSelectMenuInteraction<'cached'>, session: ComponentSession) => {
		await selectInteraction.deferUpdate();
		if (!session.settle('select')) return;

		const index = Number.parseInt(selectInteraction.values[0], 10);
		const selected = tracks[index];
		if (!selected) {
			await interaction.editReply({ components: [view.searchTimeout()], flags: [MessageFlags.IsComponentsV2] }).catch(() => null);
			return;
		}

		try {
			// 선택한 1곡을 대기열에 넣고 재생을 보장한 뒤 같은 피드백을 보낸다.
			const { wasIdle } = await container.musicPlay.enqueue(player, selected);
			await editTrackPlayReply(interaction, player, selected, wasIdle);
			await container.musicPlay.startPlayback(player);
		} catch (error) {
			container.logger.error(`[search] failed to play selected track (guild ${interaction.guildId}): ${error}`);
			await interaction
				.editReply({
					components: [errorView(`${emoji('error')} 선택한 곡을 재생하지 못했어요. 다시 /음악 검색을 시도해 주세요.`)],
					flags: [MessageFlags.IsComponentsV2],
					allowedMentions: { users: [], roles: [] }
				})
				.catch(() => null);
		}
	};

	createComponentSession(selectMessage, {
		owner: {
			userId: interaction.user.id,
			accept: (i) => i.customId === view.searchSelectCustomId || i.customId === view.searchCancelCustomId
		},
		time: SELECT_TIMEOUT_MS,
		onCollect: (collected, session) => {
			if (collected.customId === view.searchCancelCustomId) {
				void handleCancel(collected as ButtonInteraction<'cached'>, session);
				return;
			}
			void handleSelect(collected as StringSelectMenuInteraction<'cached'>, session);
		},
		onTimeout: handleTimeout
	});
}

export async function run(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
	// 검색(Lavalink REST)은 네트워크 왕복이므로 3초 응답 제한 전에 defer한다.
	await interaction.deferReply();

	const query = interaction.options.getString('query', true);
	const platformInput = interaction.options.getString('platform') || 'ytsearch';
	const platform: SearchPlatform = (VALID_PLATFORMS as readonly string[]).includes(platformInput) ? (platformInput as SearchPlatform) : 'ytsearch';

	// 유스케이스가 음성 채널 정책·검색 결과 없음 안내를 맡고, 결과가 있으면 접속까지 끝낸 뒤 돌려줘요.
	const found = await container.musicPlay.search(actorFromMember(interaction.member), {
		query,
		platform,
		requester: { id: interaction.user.id, username: interaction.user.username },
		textChannelId: interaction.channelId
	});

	const tracks = found.tracks.slice(0, RESULT_LIMIT);
	const selectMessage = await interaction.editReply({
		components: [view.searchResults(query, tracks)],
		flags: [MessageFlags.IsComponentsV2],
		allowedMentions: { users: [], roles: [] }
	});

	await runSelection(interaction, found.player, tracks, selectMessage);
}
