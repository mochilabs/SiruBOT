import { container } from '@sapphire/framework';
import { AutocompleteInteraction, ChatInputCommandInteraction, type SlashCommandOptionsOnlyBuilder, SlashCommandSubcommandBuilder } from 'discord.js';
import { SearchPlatform } from 'lavalink-client';
import { actorFromMember } from '../../application/actor.ts';
import { respondPlayQuery } from '../utils/autocomplete.ts';
import { editTrackPlayReply, replyPlaylistPlay } from '../utils/playFeedback.ts';

export const name = 'play';
export const ko = '재생';
export const description = '음성 채널에서 노래를 재생해요.';
export const descriptionEn = 'Play a track in your voice channel.';
export const preconditions = ['TextChannelAllowed', 'NodeAvailable', 'MemberListenable'];

const VALID_PLATFORMS = ['ytsearch', 'scsearch', 'spsearch'] as const;

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	const named = sub.setName(name).setNameLocalizations({ ko }).setDescription(descriptionEn).setDescriptionLocalizations({ ko: description });
	withOptions(named);
	return named;
}

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
	await respondPlayQuery(interaction, 'play');
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
