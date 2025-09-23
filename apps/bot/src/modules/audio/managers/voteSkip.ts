import { ButtonInteraction, ChatInputCommandInteraction, Collection, ComponentType, GuildMember, MessageFlags } from 'discord.js';
import { Player, Track } from 'lavalink-client';
import * as view from '../view/skip.ts';
import { createContainer } from '@sirubot/utils';

interface VoteSkipOptions {
	player: Player;
	currentTrack: Track;
	nextTrack?: Track;
	voiceChannelMembers: Collection<string, GuildMember>;
	interaction: ChatInputCommandInteraction<'cached'>;
}

interface VoteState {
	currentTrackId: string;
	voteUsers: Set<string>;
	requiredVotes: number;
}

export class VoteSkip {
	private options: VoteSkipOptions;
	private voteState: VoteState;

	constructor(options: VoteSkipOptions) {
		this.options = options;
		this.voteState = {
			currentTrackId: options.currentTrack.info.identifier,
			voteUsers: new Set<string>([options.interaction.user.id]),
			requiredVotes: Math.ceil(options.voiceChannelMembers.size / 2)
		};
	}

	public async execute(): Promise<void> {
		await this.options.interaction.reply({
			components: [this.createVoteComponent()],
			flags: [MessageFlags.IsComponentsV2]
		});

		if (!this.options.interaction.channel) return;

		const collector = this.options.interaction.channel.createMessageComponentCollector({
			filter: (i) => i.customId === 'skip_vote',
			componentType: ComponentType.Button,
			time: 30_000
		});

		collector.on('collect', (buttonInteraction) => this.handleVoteButton(buttonInteraction, collector));

		collector.on('end', () => this.handleVoteTimeout());
	}

	private createVoteComponent() {
		return view.voteSkip({
			requiredVotes: this.voteState.requiredVotes,
			voteUsers: this.voteState.voteUsers,
			trackToSkip: this.options.currentTrack,
			nextTrack: this.options.nextTrack
		});
	}

	private async handleVoteButton(buttonInteraction: ButtonInteraction, collector: any): Promise<void> {
		collector.resetTimer();

		if (!this.options.player.connected) return;

		if (this.hasTrackChanged()) {
			await this.updateToAlreadySkipped(collector);
			return;
		}

		const validationError = this.validateVote(buttonInteraction.user.id);
		if (validationError) {
			await buttonInteraction.reply({
				components: [createContainer().addTextDisplayComponents((textDisplay) => textDisplay.setContent(validationError))],
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2]
			});
			return;
		}

		this.voteState.voteUsers.add(buttonInteraction.user.id);

		if (this.voteState.voteUsers.size >= this.voteState.requiredVotes) {
			await this.completeVoteSkip(buttonInteraction, collector);
		} else {
			await this.updateVoteProgress(buttonInteraction);
		}
	}

	private hasTrackChanged(): boolean {
		return this.voteState.currentTrackId !== this.options.player.queue.current?.info.identifier;
	}

	private validateVote(userId: string): string | null {
		if (this.voteState.voteUsers.has(userId)) {
			return '❌ 이미 투표에 참여했어요.';
		}
		if (!this.options.voiceChannelMembers.has(userId)) {
			return '❌ 음성 채널에 접속한 사용자만 투표에 참여할 수 있어요.';
		}

		return null;
	}

	private async updateToAlreadySkipped(collector: any): Promise<void> {
		await this.options.interaction.editReply({
			components: [view.alreadySkipped()],
			flags: [MessageFlags.IsComponentsV2]
		});
		collector.removeAllListeners();
		collector.stop();
	}

	private async completeVoteSkip(buttonInteraction: ButtonInteraction, collector: any): Promise<void> {
		await this.options.player.skip();
		await buttonInteraction.update({
			components: [
				view.trackSkippedByVote({
					track: this.options.currentTrack,
					voteUsers: this.voteState.voteUsers
				})
			],
			flags: [MessageFlags.IsComponentsV2]
		});
		collector.removeAllListeners();
		collector.stop();
	}

	private async updateVoteProgress(buttonInteraction: ButtonInteraction): Promise<void> {
		await buttonInteraction.update({
			components: [this.createVoteComponent()],
			flags: [MessageFlags.IsComponentsV2]
		});
	}

	private async handleVoteTimeout(): Promise<void> {
		await this.options.interaction.editReply({
			components: [
				view.voteSkipTimeout({
					requiredVotes: this.voteState.requiredVotes,
					voteUsers: this.voteState.voteUsers
				})
			],
			flags: [MessageFlags.IsComponentsV2]
		});
	}
}
