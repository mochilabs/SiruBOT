import { emoji } from '@sirubot/utils';
import { AppError } from '../../../lib/appError.ts';
import type { Actor } from './actor.ts';
import type { MusicControl } from './control.ts';

/**
 * 투표 건너뛰기 유스케이스 — `/건너뛰기`의 허용 판정(강제·요청자·추천곡·단독·투표)과 진행 중인 투표를 소유해요.
 * 디스코드 메시지 렌더링·버튼 수집은 `discord/managers/voteSkip.ts`가 맡고, 여기서는 결과 객체만 돌려줘요.
 * 실제 건너뛰기는 `music.skipApproved`(음악 제어)를 거쳐요. 허용 판정이 끝난 뒤에만 부르고, 인가는 다시 검사하지 않아요.
 * 모든 의존성은 `createVoteSkip(deps)`로 명시적으로 받아요 (전역 container 접근 없음).
 */

/** 사용자에게 보여줄 문구 — 앱 이모지는 부팅 뒤에 로드되므로 호출 시점에 평가해요. */
export const VOTE_SKIP_MESSAGES = {
	noPlayer: () => `${emoji('error')} 재생 중인 곡이 없어요.`,
	noPermission: () => `${emoji('error')} 곡을 강제로 건너뛰려면 DJ 역할이나 관리자 권한이 필요해요.`,
	noMoreTracks: () => `${emoji('info')} 건너뛸 노래가 없어요.`,
	invalidIndex: () => `${emoji('info')} 건너뛸 곡이 대기열에 존재하지 않아요.`,
	mixerFailed: () => `${emoji('warning')} 예열된 곡을 정리하지 못해 스킵하지 못했어요. 잠시 후 다시 시도해 주세요.`,
	alreadyVoted: () => `${emoji('error')} 이미 투표에 참여했어요.`,
	notInVoice: () => `${emoji('error')} 음성 채널에 접속한 사용자만 투표에 참여할 수 있어요.`
} as const;

/** 과반 스킵 표 수 — 음성 채널 청취자(봇·스피커 끈 사람 제외)의 절반을 올림해요. */
export function requiredSkipVotes(listenerIds: ReadonlySet<string>): number {
	return Math.ceil(listenerIds.size / 2);
}

/** 요청 시점의 플레이어 상태 — 어댑터가 Lavalink 플레이어에서 읽어 넘겨요. */
export interface VoteSkipPlaybackSnapshot {
	/** 플레이어가 음성 채널에 연결돼 있는지 */
	connected: boolean;
	/** 현재 곡 — 재생 중인 곡이 없으면 null */
	current: { identifier: string; requesterId: string | null } | null;
	/** 대기열 전체 길이 (추천곡 포함) — 0이면 빈 대기열 */
	queueLength: number;
	/** 사용자가 넣은 대기곡 수 (추천곡 제외) — 곡 번호 건너뛰기의 범위예요 */
	userQueuedCount: number;
}

export interface VoteSkipDeps {
	/** 길드 플레이어 상태 스냅샷 — 플레이어가 없으면 undefined */
	playback(guildId: string): VoteSkipPlaybackSnapshot | undefined;
	/** 길드 DJ 역할 (설정 안 됐으면 null) */
	getDjRoleId(guildId: string): Promise<string | null>;
	/** 봇 사용자 ID (로그인 전이면 undefined) — 봇이 요청한 곡 판정에 써요 */
	getBotUserId(): string | undefined;
	/** 추천곡 requester 센티널 ID */
	relatedRequesterId: string;
	/** 음악 제어 — 실제 건너뛰기는 여기로 보내요 (인가 없는 `skipApproved`) */
	music: Pick<MusicControl, 'skipApproved'>;
}

/** 건너뛰기 요청 — 인터랙션을 어댑터가 평범한 값으로 바꿔서 넘겨요. */
export interface VoteSkipRequest {
	/** 요청 식별자 — 투표가 열리면 이 값이 투표 ID가 돼요 (인터랙션 ID). */
	requestId: string;
	actor: Actor;
	/** 요청 시점 음성 채널 청취자 ID (봇 제외, 스피커 끈 사람 제외) */
	listenerIds: ReadonlySet<string>;
	/** 강제 건너뛰기 여부 (DJ 역할 필요) */
	force: boolean;
	/** 건너뛸 대기곡 번호(1부터). 없으면 null. 어댑터가 곡 선택 값을 번호로 풀어서 넘겨요. */
	to: number | null;
}

export type VoteSkipOutcome =
	/** 바로 건너뛰었어요. by: requester(요청자 본인) · alone(혼자 있음) · forced(강제) · related(추천곡·빈 대기열의 봇 곡) */
	| { kind: 'skipped'; by: 'requester' | 'alone' | 'forced' | 'related' }
	/** 곡 번호로 건너뛰었어요. */
	| { kind: 'skipped-to'; to: number }
	/** 투표를 열었어요. 집계가 과반에 닿으면 `castVote`가 건너뛰어요. */
	| { kind: 'vote-started'; voteId: string; votes: number; requiredVotes: number };

export type VoteCastOutcome =
	/** 투표가 이미 끝났거나(곡이 바뀜·플레이어 끊김·이미 통과) 닫혔어요. */
	| { kind: 'closed' }
	/** 투표할 수 없어요. message는 클릭한 사람에게만 보여줄 문구예요. */
	| { kind: 'rejected'; message: string }
	/** 표를 셌지만 아직 과반이 안 됐어요. */
	| { kind: 'counted'; votes: number; requiredVotes: number }
	/** 과반이 되어 곡을 건너뛰었어요. */
	| { kind: 'passed'; votes: number; requiredVotes: number };

export interface VoteSummary {
	votes: number;
	requiredVotes: number;
}

export interface VoteSkipService {
	/** 허용 판정을 하고, 바로 건너뛰거나(강제·요청자·추천곡·단독·곡 번호) 투표를 열어요. */
	request(request: VoteSkipRequest): Promise<VoteSkipOutcome>;
	/** 투표 한 표를 받아요. 과반에 닿으면 곡을 건너뛰고 `passed`를 돌려줘요. */
	castVote(voteId: string, userId: string): Promise<VoteCastOutcome>;
	/** 시간 제한 등으로 투표를 닫아요. 진행 중이던 투표의 마지막 집계를 돌려주고, 없으면 null이에요. */
	closeVote(voteId: string): VoteSummary | null;
}

/** 진행 중인 투표 한 건 — 서비스 인스턴스가 들고 있어요 (모듈 전역 상태 없음). */
interface ActiveVote {
	guildId: string;
	trackIdentifier: string;
	voterIds: Set<string>;
	listenerIds: ReadonlySet<string>;
	requiredVotes: number;
	/** 과반이 되어 건너뛰는 중이면 true — 그 사이의 추가 클릭이 두 번 건너뛰지 않게 막아요. */
	passing: boolean;
}

export function createVoteSkip(deps: VoteSkipDeps): VoteSkipService {
	const activeVotes = new Map<string, ActiveVote>();

	/** 재생 중인 곡이 있어야 건너뛸 수 있어요 — 없으면 '재생 중인 곡이 없어요'로 거절해요. */
	function requireCurrent(guildId: string) {
		const snapshot = deps.playback(guildId);
		const current = snapshot?.current;
		if (!snapshot || !current) throw new AppError('not_found', VOTE_SKIP_MESSAGES.noPlayer(), { ephemeral: true });
		return { snapshot, current };
	}

	/** 허용이 판정된 바로 건너뛰기 — mixer 예열 정리에 실패하면 건너뛰지 않고 재시도 안내로 바꿔요. */
	async function skipImmediately(guildId: string, to?: number): Promise<void> {
		try {
			await deps.music.skipApproved(guildId, to === undefined ? undefined : { to });
		} catch (error) {
			if (error instanceof AppError) throw error;
			throw new AppError('unavailable', VOTE_SKIP_MESSAGES.mixerFailed(), { ephemeral: true, cause: error });
		}
	}

	/** 강제 건너뛰기 권한 — DJ 역할이 없으면 모두, 있으면 관리자 또는 DJ 역할 보유자예요. (ManageGuild는 포함하지 않아요) */
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

			// 시작자는 이미 한 표로 세요 (requestId가 투표 ID이자 버튼 customId의 근거예요).
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
				// 실패하면 투표를 다시 열어 두어요 (다음 클릭이 다시 시도해요).
				vote.passing = false;
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
