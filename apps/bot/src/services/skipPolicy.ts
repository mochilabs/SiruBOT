import { container, UserError } from '@sapphire/framework';
import { APIUser, ChatInputCommandInteraction, Collection, GuildMember, MessageFlags, VoiceBasedChannel } from 'discord.js';
import { Player, Queue, Track } from 'lavalink-client';
import { VoteSkip, requiredSkipVotes } from '../modules/audio/managers/voteSkip.ts';
import { getUserQueuedTracks } from '../modules/audio/lavalink/autoPlayRelated.ts';
import { RELATED_TRACK_REQUESTER_ID } from '../modules/audio/lavalink/requester.ts';
import * as skipView from '../modules/audio/view/skip.ts';

/** 스킵 판정 컨텍스트 — /건너뛰기와 그 하위 흐름(투표·강제·곡 지정)이 공유하는 재생 상태 스냅샷 */
export interface SkipContext {
	player: Player;
	queue: Queue;
	currentTrack: Track;
	interaction: ChatInputCommandInteraction<'cached'>;
	voiceChannel: VoiceBasedChannel;
	voiceChannelMembers: Collection<string, GuildMember>;
}

/**
 * 스킵 정책 — 재생 흐름(AudioService)과 분리한 단위 판단 모듈.
 * DJ 역할 게이트·요청자/추천곡/단독/투표 판정과 mixer 경유 스킵 실행을 담당한다.
 */
export class SkipPolicy {
	public async handleSkip(context: SkipContext, force: boolean, to: number): Promise<void> {
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
			await this.handleRelatedTrackSkip(context);
			return;
		}

		if (this.isUserAlone(context)) {
			await this.handleAloneSkip(context);
			return;
		}

		await this.handleVoteSkip(context);
	}

	private isQueueEmpty(context: SkipContext): boolean {
		return context.queue.tracks.length <= 0;
	}

	private isTrackRequestedByUser(track: Track, userId: string): boolean {
		return typeof track.requester !== 'string' && (track.requester as APIUser).id === userId;
	}

	private isTrackRequestedByBot(track: Track): boolean {
		if (typeof track.requester === 'string') return false;
		const requesterId = (track.requester as APIUser).id;
		return requesterId === container.client.user?.id || requesterId === RELATED_TRACK_REQUESTER_ID;
	}

	private isUserAlone(context: SkipContext): boolean {
		return requiredSkipVotes(context.voiceChannelMembers) <= 1;
	}

	private async handleEmptyQueue(context: SkipContext): Promise<void> {
		const { currentTrack, interaction, player } = context;

		if (this.isTrackRequestedByBot(currentTrack)) {
			await this.skipViaMixer(player, 0);
			await interaction.reply({
				components: [skipView.trackRelatedSkipped({ track: currentTrack })],
				flags: [MessageFlags.IsComponentsV2]
			});
		} else {
			throw new UserError({
				identifier: 'skip_no_more_tracks',
				message: '🔍 건너뛸 노래가 없어요.',
				context: {
					...context,
					ephemeral: true
				}
			});
		}
	}

	private async handleUserRequestedTrack(context: SkipContext): Promise<void> {
		await this.skipAndReply(context, skipView.trackSkipped({ track: context.currentTrack }));
	}

	private async handleRelatedTrackSkip(context: SkipContext): Promise<void> {
		await this.skipAndReply(context, skipView.trackRelatedSkipped({ track: context.currentTrack }));
	}

	private async handleAloneSkip(context: SkipContext): Promise<void> {
		await this.skipAndReply(context, skipView.trackSkipped({ track: context.currentTrack }));
	}

	/** 공용 스킵 피드백 — 스킵 실행 후 지정된 뷰로 즉시 응답한다 (요청자/추천곡/단독/강제 스킵이 공유). */
	private async skipAndReply(context: SkipContext, components: ReturnType<typeof skipView.trackSkipped>): Promise<void> {
		const { player, interaction } = context;
		await this.skipViaMixer(player);
		await interaction.reply({
			components: [components],
			flags: [MessageFlags.IsComponentsV2]
		});
	}

	/**
	 * mixer 경유 스킵 — 예열 슬롯 정리가 실패하면 스킵을 진행하지 않는다 (stale 예열곡이
	 * 뒤늦게 재생되는 통로). 실패는 사용자 재시도 안내로 변환한다.
	 */
	private async skipViaMixer(player: Player, position?: number): Promise<void> {
		try {
			await container.mixerService.skip(player, position);
		} catch {
			throw new UserError({
				identifier: 'skip_mixer_failed',
				message: '⚠️ 예열된 곡을 정리하지 못해 스킵하지 못했어요. 잠시 후 다시 시도해 주세요.',
				context: { ephemeral: true }
			});
		}
	}

	private async handleVoteSkip(context: SkipContext): Promise<void> {
		const voteSkip = new VoteSkip({
			player: context.player,
			currentTrack: context.currentTrack,
			nextTrack: context.queue.tracks[0] as Track,
			voiceChannelMembers: context.voiceChannelMembers,
			interaction: context.interaction
		});

		await voteSkip.execute();
	}

	private async checkDJRole(context: SkipContext): Promise<void> {
		const { interaction } = context;
		const hasPermission = await container.guildService.hasDJRole(interaction.guildId, interaction.member);

		if (!hasPermission) {
			throw new UserError({
				identifier: 'forceskip_no_permission',
				message: '❌ 곡을 강제로 건너뛰려면 DJ 역할이나 관리자 권한이 필요해요.',
				context: { ephemeral: true }
			});
		}
	}

	private async handleForceSkip(context: SkipContext): Promise<void> {
		await this.skipAndReply(context, skipView.trackSkipped({ track: context.currentTrack }));
	}

	private async handleSkipTo(context: SkipContext, to: number): Promise<void> {
		const { player, interaction } = context;
		if (to > getUserQueuedTracks(player).length) {
			throw new UserError({
				identifier: 'skipto_invalid_index',
				message: '🎵 건너뛸 곡이 대기열에 존재하지 않아요.',
				context: { ephemeral: true }
			});
		}

		const track = player.queue.tracks[to - 1] as Track;

		await this.skipViaMixer(player, to);
		await interaction.reply({
			components: [
				skipView.trackSkippedTo({
					track,
					to
				})
			],
			flags: [MessageFlags.IsComponentsV2]
		});
	}
}

/** 컨테이너 등록 없이 공유하는 단일 인스턴스 — 상태가 없어 어디서 불러도 같다. */
export const skipPolicy = new SkipPolicy();
