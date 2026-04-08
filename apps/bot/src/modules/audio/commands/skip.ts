import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import {
	ApplicationIntegrationType,
	ChatInputCommandInteraction,
	VoiceBasedChannel,
	GuildMember,
	Collection,
	AutocompleteInteraction
} from 'discord.js';
import { Player, Queue, Track } from 'lavalink-client';

export interface SkipContext {
	player: Player;
	queue: Queue;
	currentTrack: Track;
	interaction: ChatInputCommandInteraction<'cached'>;
	voiceChannel: VoiceBasedChannel;
	voiceChannelMembers: Collection<string, GuildMember>;
}

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'skip',
	description: '현재 재생 중인 곡을 건너뛰어요.',
	fullCategory: ['음악'],
	preconditions: ['TextChannelAllowed', 'NodeAvailable', 'VoiceConnected', 'SameVoiceChannel', 'MemberListenable', 'SongPlaying', 'DJOrAlone']
})
export class SkipCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({
					ko: '건너뛰기'
				})
				.setDescription(this.description)
				.setDescriptionLocalizations({
					ko: '현재 재생 중인 곡을 건너뜁니다.'
				})
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
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		if (!interaction.inCachedGuild()) return;

		const context = await this.buildSkipContext(interaction);
		if (!context) return;

		const force = interaction.options.getBoolean('force') ?? false;
		const to = interaction.options.getInteger('to') ?? 0;

		await this.container.audioService.handleSkip(context, force, to);
	}

	private async buildSkipContext(interaction: ChatInputCommandInteraction): Promise<SkipContext | null> {
		if (!interaction.inCachedGuild()) return null;

		const player = this.container.audio.getPlayer(interaction.guildId);
		if (!player) return null;

		const queue = player.queue;
		const currentTrack = queue.current;
		if (!currentTrack) return null;

		const member = interaction.member;
		const voiceChannel = member?.voice.channel;
		if (!voiceChannel) return null;

		const voiceChannelMembers = voiceChannel.members.filter(
			(member: GuildMember) => !member.user.bot && (member.voice.selfDeaf === false || member.voice.serverDeaf === false)
		);

		return {
			player,
			queue,
			currentTrack,
			interaction,
			voiceChannel,
			voiceChannelMembers
		};
	}

	public override async autocompleteRun(interaction: AutocompleteInteraction) {
		if (!interaction.inCachedGuild()) return;

		const option = interaction.options.get('to', false);
		const to = typeof option?.value === 'string' ? (option.value.trim().length < 1 ? 1 : parseInt(option.value)) : 1;

		const player = this.container.audio.getPlayer(interaction.guildId);
		if (!player) return interaction.respond([]);

		const queue = player.queue;
		if (!queue) return interaction.respond([]);

		const toIndex = to - 1;
		const data = queue.tracks.slice(toIndex, toIndex + 25).map((track, index) => ({
			name: `#${toIndex + index + 1} ${track.info.title.slice(0, 100)}`,
			value: toIndex + index + 1
		}));

		await interaction.respond(data);
	}
}
