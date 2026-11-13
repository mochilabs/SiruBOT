import { container } from '@sapphire/framework';
import { getSimpleYouTubeSuggestions } from '../../../../services/dataApiClient.ts';
import { AutocompleteInteraction, ChatInputCommandInteraction, type SlashCommandOptionsOnlyBuilder, SlashCommandSubcommandBuilder } from 'discord.js';
import { SearchPlatform } from 'lavalink-client';
import { actorFromMember } from '../../application/actor.ts';
import { editTrackPlayReply, replyPlaylistPlay } from '../utils/playFeedback.ts';

export const name = 'play';
export const ko = '재생';
export const description = '음성 채널에서 노래를 재생해요.';
/** en-US 기본 설명 (기본 로케일이 영어예요) */
export const descriptionEn = 'Play a track in your voice channel.';
/** 음성 채널 조건(봇과 같은 채널, 원격 권한자 예외)은 음악 유스케이스가 판정해요. */
export const preconditions = ['TextChannelAllowed', 'NodeAvailable', 'MemberListenable'];

const VALID_PLATFORMS = ['ytsearch', 'scsearch', 'spsearch'] as const;

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	const named = sub.setName(name).setNameLocalizations({ ko }).setDescription(descriptionEn).setDescriptionLocalizations({ ko: description });
	withOptions(named);
	return named;
}

/** 옵션만 붙여요 — `/재생`처럼 서브커맨드 없이 top-level 커맨드로 승격할 때 같은 옵션 정의를 재사용해요 */
export function withOptions<T extends SlashCommandSubcommandBuilder | SlashCommandOptionsOnlyBuilder>(builder: T): void {
	builder
		.addStringOption((option) =>
			option
				.setName('query')
				.setNameLocalizations({ ko: '검색어' })
				.setDescription('Enter the title or URL of the song you want to play.')
				.setDescriptionLocalizations({ ko: '재생할 노래의 제목이나 주소를 입력해 주세요.' })
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
	await interaction.deferReply();

	const query = interaction.options.getString('query', true);
	const platformInput = interaction.options.getString('platform') || 'ytsearch';
	const platform: SearchPlatform = (VALID_PLATFORMS as readonly string[]).includes(platformInput) ? (platformInput as SearchPlatform) : 'ytsearch';

	const result = await container.musicPlay.play(
		actorFromMember(interaction.member),
		{
			query,
			platform,
			requester: { id: interaction.user.id, username: interaction.user.username },
			textChannelId: interaction.channelId
		},
		{ kind: 'selected' }
	);

	if (result.playlist) {
		await replyPlaylistPlay(interaction, result);
		return;
	}
	await editTrackPlayReply(interaction, result.player, result.queued[0]!, result.wasIdle);
}
