import { ButtonInteraction, ChatInputCommandInteraction, Collection, ComponentType, GuildMember, MessageFlags } from 'discord.js';
import { Player, Track } from 'lavalink-client';
import { container } from '@sapphire/framework';
import * as view from '../views/skip.ts';
import { emoji } from '@sirubot/utils';
import { voteSkipId } from '../customIds.ts';
import { notice } from '../../../../modules/general/view/notice.ts';
import { createComponentSession, type ComponentSession } from '../../../../lib/componentSession.ts';

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

/**
 * 청취 가능 멤버의 과반 스킵 표 수 — VoteSkip.requiredVotes와 단독 스킵 판정(isUserAlone)이
 * 같은 멤버 필터(skip의 buildSkipContext)를 공유하므로 과반 계산 규칙도 한 곳에서 정의한다.
 */
export function requiredSkipVotes(members: Collection<string, GuildMember>): number {
	return Math.ceil(members.size / 2);
}

export class VoteSkip {
	private options: VoteSkipOptions;
	private readonly customId: string;
	private voteState: VoteState;

	constructor(options: VoteSkipOptions) {
		this.options = options;
		this.customId = voteSkipId.encode('vote', { interactionId: options.interaction.id });
		this.voteState = {
			currentTrackId: options.currentTrack.info.identifier,
			voteUsers: new Set<string>([options.interaction.user.id]),
			requiredVotes: requiredSkipVotes(options.voiceChannelMembers)
		};
	}

	public async execute(): Promise<void> {
		await this.options.interaction.reply({
			components: [this.createVoteComponent()],
			flags: [MessageFlags.IsComponentsV2]
		});

		if (!this.options.interaction.channel) return;

		createComponentSession<ButtonInteraction>(this.options.interaction.channel, {
			filter: (i) => i.customId === this.customId,
			componentType: ComponentType.Button,
			time: 30_000,
			onCollect: (buttonInteraction, session) => this.handleVoteButton(buttonInteraction, session),
			onTimeout: () => this.handleVoteTimeout()
		});
	}

	private createVoteComponent() {
		return view.voteSkip({
			requiredVotes: this.voteState.requiredVotes,
			voteUsers: this.voteState.voteUsers,
			trackToSkip: this.options.currentTrack,
			nextTrack: this.options.nextTrack,
			customId: this.customId
		});
	}

	private async handleVoteButton(buttonInteraction: ButtonInteraction, session: ComponentSession): Promise<void> {
		if (!this.options.player.connected || this.hasTrackChanged()) {
			await this.updateToAlreadySkipped(buttonInteraction, session);
			return;
		}

		const validationError = this.validateVote(buttonInteraction.user.id);
		if (validationError) {
			await buttonInteraction.reply({
				components: [notice(validationError)],
				flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2]
			});
			return;
		}

		this.voteState.voteUsers.add(buttonInteraction.user.id);

		if (this.voteState.voteUsers.size >= this.voteState.requiredVotes) {
			await this.completeVoteSkip(buttonInteraction, session);
		} else {
			await this.updateVoteProgress(buttonInteraction);
		}
	}

	private hasTrackChanged(): boolean {
		return this.voteState.currentTrackId !== this.options.player.queue.current?.info.identifier;
	}

	private validateVote(userId: string): string | null {
		if (this.voteState.voteUsers.has(userId)) {
			return `${emoji('error')} 이미 투표에 참여했어요.`;
		}
		if (!this.options.voiceChannelMembers.has(userId)) {
			return `${emoji('error')} 음성 채널에 접속한 사용자만 투표에 참여할 수 있어요.`;
		}

		return null;
	}

	private async updateToAlreadySkipped(buttonInteraction: ButtonInteraction, session: ComponentSession): Promise<void> {
		// 클릭한 인터랙션을 직접 갱신해야 "상호작용 실패"가 뜨지 않아요.
		await buttonInteraction.update({
			components: [view.alreadySkipped()],
			flags: [MessageFlags.IsComponentsV2]
		});
		session.settle();
	}

	private async completeVoteSkip(buttonInteraction: ButtonInteraction, session: ComponentSession): Promise<void> {
		await container.mixerService.skip(this.options.player as import('../../lavalink/player/customPlayer.ts').CustomPlayer);
		await buttonInteraction.update({
			components: [
				view.trackSkippedByVote({
					track: this.options.currentTrack,
					voteUsers: this.voteState.voteUsers
				})
			],
			flags: [MessageFlags.IsComponentsV2]
		});
		session.settle();
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
