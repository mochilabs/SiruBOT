import { resolveQueueSelection } from '../utils/queueSelection.ts';
import { respondQueuedTracks } from '../utils/autocomplete.ts';
import { container, UserError } from '@sapphire/framework';
import { emoji } from '@sirubot/utils';
import {
	AutocompleteInteraction,
	ChatInputCommandInteraction,
	GuildMember,
	MessageFlags,
	type SlashCommandOptionsOnlyBuilder,
	SlashCommandSubcommandBuilder
} from 'discord.js';
import type { Track } from 'lavalink-client';
import { actorFromMember } from '../../application/actor.ts';
import * as skipView from '../views/skip.ts';
import { showVoteSkip } from '../managers/voteSkip.ts';

export const name = 'skip';
export const ko = '건너뛰기';
export const description = '현재 재생 중인 곡을 건너뛰어요.';
/** en-US 기본 설명 (기본 로케일이 영어예요) */
export const descriptionEn = 'Skip the current track.';
export const preconditions = ['TextChannelAllowed', 'NodeAvailable', 'VoiceConnected', 'SameVoiceChannel', 'MemberListenable', 'SongPlaying'];

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	const named = sub.setName(name).setNameLocalizations({ ko }).setDescription(descriptionEn).setDescriptionLocalizations({ ko: description });
	withOptions(named);
	return named;
}

/** 옵션만 붙여요 — `/건너뛰기`처럼 top-level 커맨드로 승격할 때 같은 옵션 정의를 재사용해요 */
export function withOptions<T extends SlashCommandSubcommandBuilder | SlashCommandOptionsOnlyBuilder>(builder: T): void {
	builder
		.addBooleanOption((option) =>
			option
				.setName('force')
				.setDescription('Skip the current track without a vote')
				.setNameLocalizations({ ko: '강제' })
				.setDescriptionLocalizations({ ko: '투표 없이 강제로 곡을 건너뛰어요.' })
				.setRequired(false)
		)
		.addStringOption((option) =>
			option
				.setName('to')
				.setDescription('Skip forward to the given queue position.')
				.setNameLocalizations({ ko: '곡' })
				.setDescriptionLocalizations({ ko: '이 번호의 곡부터 재생해요. 앞의 대기곡은 건너뛰어요.' })

				.setRequired(false)
				.setAutocomplete(true)
		);
}

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
	await respondQueuedTracks(interaction);
}

/**
 * `/건너뛰기` — 허용 판정과 투표는 `container.voteSkip`(application/voteSkip.ts)이 맡고,
 * 여기서는 인터랙션을 평범한 요청으로 바꾸고 결과를 디스코드 메시지로 그려요.
 */
export async function run(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
	const player = container.audio.getPlayer(interaction.guildId);
	const currentTrack = player?.queue.current as Track | undefined;
	const voiceChannel = interaction.member?.voice.channel;
	if (!player || !currentTrack || !voiceChannel) {
		throw new UserError({
			identifier: 'skip_no_player',
			message: `${emoji('error')} 재생 중인 곡이 없어요.`,
			context: { ephemeral: true }
		});
	}

	const listenerIds = new Set(
		voiceChannel.members
			.filter((member: GuildMember) => !member.user.bot && member.voice.selfDeaf === false && member.voice.serverDeaf === false)
			.keys()
	);
	const force = interaction.options.getBoolean('force') ?? false;
	const selection = interaction.options.getString('to');
	const to = selection ? resolveQueueSelection(player, selection) + 1 : null;
	// 곡 번호 건너뛰기의 대상 곡은 스킵 전에 읽어 둬요 (스킵하면 대기열이 줄어요).
	const targetTrack = to ? (player.queue.tracks[to - 1] as Track | undefined) : undefined;

	const outcome = await container.voteSkip.request({
		requestId: interaction.id,
		actor: actorFromMember(interaction.member),
		listenerIds,
		force,
		to
	});

	switch (outcome.kind) {
		case 'skipped':
			await interaction.reply({
				components: [
					outcome.by === 'related' ? skipView.trackRelatedSkipped({ track: currentTrack }) : skipView.trackSkipped({ track: currentTrack })
				],
				flags: [MessageFlags.IsComponentsV2]
			});
			return;
		case 'skipped-to':
			await interaction.reply({
				components: [skipView.trackSkippedTo({ track: targetTrack as Track, to: outcome.to })],
				flags: [MessageFlags.IsComponentsV2]
			});
			return;
		case 'vote-started':
			await showVoteSkip({
				interaction,
				voteId: outcome.voteId,
				votes: outcome.votes,
				requiredVotes: outcome.requiredVotes,
				currentTrack,
				nextTrack: player.queue.tracks[0] as Track | undefined
			});
			return;
	}
}
