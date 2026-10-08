import { container, UserError } from '@sapphire/framework';
import { appEmoji } from '@sirubot/utils';
import {
	AutocompleteInteraction,
	ChatInputCommandInteraction,
	Collection,
	GuildMember,
	SlashCommandSubcommandBuilder,
	VoiceBasedChannel
} from 'discord.js';
import { Player, Queue, Track } from 'lavalink-client';
import { getUserQueuedTracks } from '../lavalink/autoPlayRelated.ts';

export const name = 'skip';
export const ko = '건너뛰기';
export const description = '현재 재생 중인 곡을 건너뛰어요.';
export const preconditions = [
	'TextChannelAllowed',
	'NodeAvailable',
	'VoiceConnected',
	'SameVoiceChannel',
	'MemberListenable',
	'SongPlaying',
	'DJOrAlone'
];

export interface SkipContext {
	player: Player;
	queue: Queue;
	currentTrack: Track;
	interaction: ChatInputCommandInteraction<'cached'>;
	voiceChannel: VoiceBasedChannel;
	voiceChannelMembers: Collection<string, GuildMember>;
}

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	return sub
		.setName(name)
		.setNameLocalizations({ ko })
		.setDescription(description)
		.setDescriptionLocalizations({ ko: '현재 재생 중인 곡을 건너뜁니다.' })
		.addBooleanOption((option) =>
			option
				.setName('force')
				.setDescription('Skip the current track without a vote')
				.setNameLocalizations({ ko: '강제' })
				.setDescriptionLocalizations({ ko: '투표 없이 강제로 곡을 건너뛰어요.' })
				.setRequired(false)
		)
		.addIntegerOption((option) =>
			option
				.setName('to')
				.setDescription('Skip to the specified track')
				.setNameLocalizations({ ko: '곡' })
				.setDescriptionLocalizations({ ko: '건너뛸 곡의 번호를 입력해주세요.' })
				.setMinValue(1)
				.setRequired(false)
				.setAutocomplete(true)
		);
}

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
	if (!interaction.inCachedGuild()) return;

	const option = interaction.options.get('to', false);
	const to = typeof option?.value === 'string' ? (option.value.trim().length < 1 ? 1 : parseInt(option.value)) : 1;

	const player = container.audio.getPlayer(interaction.guildId);
	if (!player) return interaction.respond([]);

	const queue = player.queue;
	if (!queue) return interaction.respond([]);

	const toIndex = to - 1;
	const data = getUserQueuedTracks(player)
		.slice(toIndex, toIndex + 25)
		.map((track, index) => ({
			name: `#${toIndex + index + 1} ${track.info.title.slice(0, 100)}`,
			value: toIndex + index + 1
		}));

	await interaction.respond(data);
}

async function buildSkipContext(interaction: ChatInputCommandInteraction<'cached'>): Promise<SkipContext | null> {
	const player = container.audio.getPlayer(interaction.guildId);
	if (!player) return null;

	const queue = player.queue;
	const currentTrack = queue.current;
	if (!currentTrack) return null;

	const member = interaction.member;
	const voiceChannel = member?.voice.channel;
	if (!voiceChannel) return null;

	const voiceChannelMembers = voiceChannel.members.filter(
		(member: GuildMember) => !member.user.bot && member.voice.selfDeaf === false && member.voice.serverDeaf === false
	);

	return { player, queue, currentTrack, interaction, voiceChannel, voiceChannelMembers };
}

export async function run(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
	const context = await buildSkipContext(interaction);
	if (!context) {
		throw new UserError({
			identifier: 'skip_no_player',
			message: `${appEmoji('error', '❌')} 재생 중인 곡이 없어요.`,
			context: { ephemeral: true }
		});
	}

	const force = interaction.options.getBoolean('force') ?? false;
	const to = interaction.options.getInteger('to') ?? 0;

	await container.audioService.handleSkip(context, force, to);
}
