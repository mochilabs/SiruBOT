import { emoji } from '@sirubot/utils';
import { AppError } from '../../../lib/appError.ts';
import type { Actor } from './actor.ts';
import type { MusicControl } from './control.ts';

export const VOTE_SKIP_MESSAGES = {
	noPlayer: () => `${emoji('error')} 재생 중인 곡이 없어요.`,
	noPermission: () => `${emoji('error')} 곡을 강제로 건너뛰려면 DJ 역할이나 관리자 권한이 필요해요.`,
	noMoreTracks: () => `${emoji('info')} 건너뛸 노래가 없어요.`,
	invalidIndex: () => `${emoji('info')} 건너뛸 곡이 대기열에 존재하지 않아요.`,
	mixerFailed: () => `${emoji('warning')} 예열된 곡을 정리하지 못해 스킵하지 못했어요. 잠시 후 다시 시도해 주세요.`,
	alreadyVoted: () => `${emoji('error')} 이미 투표에 참여했어요.`,
	notInVoice: () => `${emoji('error')} 음성 채널에 접속한 사용자만 투표에 참여할 수 있어요.`
} as const;

export function requiredSkipVotes(listenerIds: ReadonlySet<string>): number {
	return Math.ceil(listenerIds.size / 2);
}

export interface VoteSkipPlaybackSnapshot {
	connected: boolean;
	current: { identifier: string; requesterId: string | null } | null;
	queueLength: number;
	userQueuedCount: number;
}

export interface VoteSkipDeps {
	playback(guildId: string): VoteSkipPlaybackSnapshot | undefined;
	getDjRoleId(guildId: string): Promise<string | null>;
	getBotUserId(): string | undefined;
	relatedRequesterId: string;
	music: Pick<MusicControl, 'skipApproved'>;
}

export interface VoteSkipRequest {
	requestId: string;
	actor: Actor;
	listenerIds: ReadonlySet<string>;
	force: boolean;
	to: number | null;
}

export type VoteSkipOutcome =
	| { kind: 'skipped'; by: 'requester' | 'alone' | 'forced' | 'related' }
	| { kind: 'skipped-to'; to: number }
	| { kind: 'vote-started'; voteId: string; votes: number; requiredVotes: number };

export type VoteCastOutcome =
	| { kind: 'closed' }
	| { kind: 'rejected'; message: string }
	| { kind: 'counted'; votes: number; requiredVotes: number }
	| { kind: 'passed'; votes: number; requiredVotes: number };

export interface VoteSummary {
	votes: number;
	requiredVotes: number;
}

export interface VoteSkipService {
	request(request: VoteSkipRequest): Promise<VoteSkipOutcome>;
	castVote(voteId: string, userId: string): Promise<VoteCastOutcome>;
	closeVote(voteId: string): VoteSummary | null;
}

interface ActiveVote {
	guildId: string;
	trackIdentifier: string;
	voterIds: Set<string>;
	listenerIds: ReadonlySet<string>;
	requiredVotes: number;
	passing: boolean;
}

export function createVoteSkip(deps: VoteSkipDeps): VoteSkipService {
	const activeVotes = new Map<string, ActiveVote>();

	function requireCurrent(guildId: string) {
		const snapshot = deps.playback(guildId);
		const current = snapshot?.current;
		if (!snapshot || !current) throw new AppError('not_found', VOTE_SKIP_MESSAGES.noPlayer(), { ephemeral: true });
		return { snapshot, current };
	}

	async function skipImmediately(guildId: string, to?: number): Promise<void> {
		try {
			await deps.music.skipApproved(guildId, to === undefined ? undefined : { to });
		} catch (error) {
			if (error instanceof AppError) throw error;
			throw new AppError('unavailable', VOTE_SKIP_MESSAGES.mixerFailed(), { ephemeral: true, cause: error });
		}
	}

	function canForce(actor: Actor, djRoleId: string | null): boolean {
		return djRoleId === null || actor.isAdministrator || actor.roleIds.has(djRoleId);
	}

	function isRequestedBy(requesterId: string | null, userId: string): boolean {
		return requesterId !== null && requesterId === userId;
	}

	function isRequestedByBot(requesterId: string | null, botUserId: string | undefined): boolean {
		return requesterId !== null && (requesterId === botUserId || requesterId === deps.relatedRequesterId);
	}

	async function skipEmptyQueue(guildId: string, requesterId: string | null, botUserId: string | undefined): Promise<VoteSkipOutcome> {
		if (!isRequestedByBot(requesterId, botUserId)) {
			throw new AppError('not_found', VOTE_SKIP_MESSAGES.noMoreTracks(), { ephemeral: true });
		}
		await skipImmediately(guildId);
		return { kind: 'skipped', by: 'related' };
	}

	return {
		async request(request) {
			const { actor, listenerIds, force, to, requestId } = request;
			const { snapshot, current } = requireCurrent(actor.guildId);
			const botUserId = deps.getBotUserId();
			const requesterId = current.requesterId;

			if (force || to) {
				const djRoleId = await deps.getDjRoleId(actor.guildId);
				if (!canForce(actor, djRoleId)) throw new AppError('forbidden', VOTE_SKIP_MESSAGES.noPermission(), { ephemeral: true });

				if (to) {
					if (to > snapshot.userQueuedCount) throw new AppError('not_found', VOTE_SKIP_MESSAGES.invalidIndex(), { ephemeral: true });
					await skipImmediately(actor.guildId, to);
					return { kind: 'skipped-to', to };
				}
				if (snapshot.queueLength === 0) return skipEmptyQueue(actor.guildId, requesterId, botUserId);
				await skipImmediately(actor.guildId);
				return { kind: 'skipped', by: 'forced' };
			}

			if (snapshot.queueLength === 0) return skipEmptyQueue(actor.guildId, requesterId, botUserId);
			if (isRequestedBy(requesterId, actor.userId)) {
				await skipImmediately(actor.guildId);
				return { kind: 'skipped', by: 'requester' };
			}
			if (isRequestedByBot(requesterId, botUserId)) {
				await skipImmediately(actor.guildId);
				return { kind: 'skipped', by: 'related' };
			}
			const requiredVotes = requiredSkipVotes(listenerIds);
			if (requiredVotes <= 1) {
				await skipImmediately(actor.guildId);
				return { kind: 'skipped', by: 'alone' };
			}

			activeVotes.set(requestId, {
				guildId: actor.guildId,
				trackIdentifier: current.identifier,
				voterIds: new Set([actor.userId]),
				listenerIds,
				requiredVotes,
				passing: false
			});
			return { kind: 'vote-started', voteId: requestId, votes: 1, requiredVotes };
		},

		async castVote(voteId, userId) {
			const vote = activeVotes.get(voteId);
			if (!vote) return { kind: 'closed' };
			// 과반 처리 중인 투표에는 표를 더 받지 않아요 (건너뛰기는 한 번만).
			if (vote.passing) return { kind: 'closed' };

			const snapshot = deps.playback(vote.guildId);
			if (!snapshot?.connected || snapshot.current?.identifier !== vote.trackIdentifier) {
				activeVotes.delete(voteId);
				return { kind: 'closed' };
			}
			if (vote.voterIds.has(userId)) return { kind: 'rejected', message: VOTE_SKIP_MESSAGES.alreadyVoted() };
			if (!vote.listenerIds.has(userId)) return { kind: 'rejected', message: VOTE_SKIP_MESSAGES.notInVoice() };

			vote.voterIds.add(userId);
			const votes = vote.voterIds.size;
			if (votes < vote.requiredVotes) return { kind: 'counted', votes, requiredVotes: vote.requiredVotes };

			vote.passing = true;
			try {
				await deps.music.skipApproved(vote.guildId);
			} catch (error) {
				// 실패하면 투표를 다시 열고 이 표도 빼요. 그래야 방금 누른 사람이 다시 눌러 재시도할 수 있어요.
				vote.passing = false;
				vote.voterIds.delete(userId);
				throw error;
			}
			activeVotes.delete(voteId);
			return { kind: 'passed', votes, requiredVotes: vote.requiredVotes };
		},

		closeVote(voteId) {
			const vote = activeVotes.get(voteId);
			if (!vote) return null;
			activeVotes.delete(voteId);
			return { votes: vote.voterIds.size, requiredVotes: vote.requiredVotes };
		}
	};
}
