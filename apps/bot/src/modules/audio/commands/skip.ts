import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import {
	APIUser,
	ApplicationIntegrationType,
	ChatInputCommandInteraction,
	MessageFlags,
	VoiceBasedChannel,
	GuildMember,
	Collection,
	AutocompleteInteraction
} from 'discord.js';
import * as view from '../view/skip.ts';
import { Player, Queue, Track } from 'lavalink-client';

interface SkipContext {
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
	description: 'Skip the current song.',
	preconditions: ['NodeAvailable', 'VoiceConnected', 'SameVoiceChannel', 'MemberListenable', 'SongPlaying']
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

		// 강제 스킵 / Skip to 옵션 처리
		const force = interaction.options.getBoolean('force') ?? false;
		const to = interaction.options.getInteger('to') ?? 0;
		if (force || to) {
			await this.checkDJRole(context);
			if (to) {
				await this.handleSkipTo(context, to);
				return;
			} else if (this.isQueueEmpty(context)) {
				await this.handleEmptyQueue(context);
				return;
			} else {
				await this.handleForceSkip(context);
				return;
			}
		}

		if (this.isQueueEmpty(context)) {
			await this.handleEmptyQueue(context);
			return;
		}

		if (this.isTrackRequestedByUser(context.currentTrack, context.interaction.user.id)) {
			await this.handleUserRequestedTrack(context);
			return;
		}

		if (this.isTrackRequestedByBot(context.currentTrack)) {
			await this.handleBotRecommendedTrack(context);
			return;
		}

		if (this.isUserAlone(context)) {
			await this.handleAloneSkip(context);
			return;
		}

		await this.handleVoteSkip(context);
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

		const voiceChannelMembers = voiceChannel.members.filter((member: GuildMember) => !member.user.bot);

		return {
			player,
			queue,
			currentTrack,
			interaction,
			voiceChannel,
			voiceChannelMembers
		};
	}

	private isQueueEmpty(context: SkipContext): boolean {
		return context.queue.tracks.length <= 0;
	}

	private isTrackRequestedByUser(track: any, userId: string): boolean {
		return typeof track.requester !== 'string' && (track.requester as APIUser).id === userId;
	}

	private isTrackRequestedByBot(track: any): boolean {
		return typeof track.requester !== 'string' && (track.requester as APIUser).id === this.container.client.user?.id;
	}

	private isUserAlone(context: SkipContext): boolean {
		return context.voiceChannelMembers.size <= 1;
	}

	private async handleEmptyQueue(context: SkipContext): Promise<void> {
		const { currentTrack, interaction, player } = context;

		if (this.isTrackRequestedByBot(currentTrack)) {
			await player.skip(0, false);
			await interaction.reply({
				content: '추천 곡 건너뛰기 테스트'
			});
		} else {
			await interaction.reply({
				components: [view.queueIsEmpty()],
				flags: [MessageFlags.IsComponentsV2]
			});
		}
	}

	private async handleUserRequestedTrack(context: SkipContext): Promise<void> {
		const { player, currentTrack, interaction } = context;

		await player.skip();
		await interaction.reply({
			components: [
				view.trackSkipped({
					track: currentTrack,
					requester: interaction.user
				})
			],
			flags: [MessageFlags.IsComponentsV2]
		});
	}

	private async handleBotRecommendedTrack(context: SkipContext): Promise<void> {
		const { player, currentTrack, interaction } = context;

		await player.skip();
		await interaction.reply({
			components: [view.trackRelatedSkipped({ track: currentTrack })],
			flags: [MessageFlags.IsComponentsV2]
		});
	}

	private async handleAloneSkip(context: SkipContext): Promise<void> {
		const { player, currentTrack, interaction } = context;

		await player.skip();
		await interaction.reply({
			components: [
				view.trackSkipped({
					track: currentTrack,
					requester: interaction.user
				})
			],
			flags: [MessageFlags.IsComponentsV2]
		});
	}

	private async handleVoteSkip(context: SkipContext): Promise<void> {
		// Todo: handle button actions
		const { voiceChannelMembers, currentTrack, interaction } = context;

		const voteUsers = new Set<string>([interaction.user.id]);
		const requiredVotes = Math.ceil(voiceChannelMembers.size / 2);
		const totalVotes = 1; // 요청자의 투표

		const voteSkip = view.voteSkip({
			requiredVotes,
			totalVotes,
			trackToSkip: currentTrack,
			requester: interaction.user
		});

		await interaction.reply({
			components: [voteSkip],
			flags: [MessageFlags.IsComponentsV2]
		});
	}

	private async checkDJRole(context: SkipContext): Promise<boolean> {
		const { interaction } = context;
		const hasPermission = await this.container.guildService.hasDJRole(interaction.guildId, interaction.member);

		if (!hasPermission) {
			throw new UserError({
				identifier: 'forceskip_no_permission',
				message: '노래를 강제로 건너뛸 권한이 없어요.'
			});
		}

		return true;
	}

	private async handleForceSkip(context: SkipContext): Promise<void> {
		const { player, currentTrack, interaction } = context;

		await player.skip();
		await interaction.reply({
			components: [
				view.trackSkipped({
					track: currentTrack,
					requester: interaction.user
				})
			],
			flags: [MessageFlags.IsComponentsV2]
		});
	}

	private async handleSkipTo(context: SkipContext, to: number): Promise<void> {
		const { player, interaction } = context;
		if (to > player.queue.tracks.length) {
			throw new UserError({
				identifier: 'skipto_invalid_index',
				message: '건너뛸 곡이 대기열에 존재하지 않아요.'
			});
		}

		const track = player.queue.tracks[to - 1] as Track;

		await player.skip(to);
		await interaction.reply({
			components: [
				view.trackSkippedTo({
					track,
					to
				})
			],
			flags: [MessageFlags.IsComponentsV2]
		});
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
