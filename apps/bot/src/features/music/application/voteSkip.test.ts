import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../lib/appError.ts';
import type { Actor } from './actor.ts';
import { createVoteSkip, requiredSkipVotes, VOTE_SKIP_MESSAGES, type VoteSkipPlaybackSnapshot, type VoteSkipRequest } from './voteSkip.ts';

const BOT_ID = 'bot-self';
const RELATED = 'related_track';

function actor(overrides: Partial<Actor> = {}): Actor {
	return {
		guildId: 'g1',
		userId: 'requester',
		voiceChannelId: 'vc',
		isAdministrator: false,
		canManageGuild: false,
		roleIds: new Set<string>(),
		humansInVoiceChannel: 3,
		...overrides
	};
}

function listeners(...ids: string[]): ReadonlySet<string> {
	return new Set(ids);
}

/** n명의 청취자(요청자 포함) — 아이디는 `m0`, `m1`…이고 `requester`를 맨 앞에 넣어요. */
function crowd(count: number): ReadonlySet<string> {
	return new Set(['requester', ...Array.from({ length: count - 1 }, (_, i) => `m${i}`)]);
}

function snapshot(overrides: Partial<VoteSkipPlaybackSnapshot> = {}): VoteSkipPlaybackSnapshot {
	return {
		connected: true,
		current: { identifier: 'track-1', requesterId: 'someone-else' },
		queueLength: 1,
		userQueuedCount: 1,
		...overrides
	};
}

interface HarnessOptions {
	snapshot?: VoteSkipPlaybackSnapshot | undefined;
	djRoleId?: string | null;
	skipApproved?: () => Promise<{ skipped: true }>;
}

function harness(options: HarnessOptions = {}) {
	let state: VoteSkipPlaybackSnapshot | undefined = 'snapshot' in options ? options.snapshot : snapshot();
	const skipApproved = vi.fn<(guildId: string, options?: { to?: number }) => Promise<{ skipped: true }>>(
		async () => options.skipApproved?.() ?? { skipped: true as const }
	);
	const service = createVoteSkip({
		playback: () => state,
		getDjRoleId: async () => (options.djRoleId === undefined ? null : options.djRoleId),
		getBotUserId: () => BOT_ID,
		relatedRequesterId: RELATED,
		music: { skipApproved }
	});
	return {
		service,
		skipApproved,
		setState(next: VoteSkipPlaybackSnapshot | undefined) {
			state = next;
		}
	};
}

function request(overrides: Partial<VoteSkipRequest> = {}): VoteSkipRequest {
	return {
		requestId: '100000000000000001',
		actor: actor(),
		listenerIds: crowd(5),
		force: false,
		to: null,
		...overrides
	};
}

async function rejection(promise: Promise<unknown>): Promise<AppError> {
	const error = await promise.then(
		() => null,
		(thrown: unknown) => thrown
	);
	expect(error).toBeInstanceOf(AppError);
	return error as AppError;
}

describe('requiredSkipVotes (과반 스킵 표 수)', () => {
	it('청취자 인원의 절반을 올림한 값이 필요 표 수다', () => {
		expect(requiredSkipVotes(new Set())).toBe(0);
		expect(requiredSkipVotes(listeners('a'))).toBe(1);
		expect(requiredSkipVotes(listeners('a', 'b'))).toBe(1);
		expect(requiredSkipVotes(crowd(3))).toBe(2);
		expect(requiredSkipVotes(crowd(4))).toBe(2);
		expect(requiredSkipVotes(crowd(9))).toBe(5);
	});
});

describe('request: 바로 건너뛰기 분기 (투표 없음)', () => {
	it('요청자 본인이 튼 곡이면 투표 없이 건너뛰어요', async () => {
		const { service, skipApproved } = harness({ snapshot: snapshot({ current: { identifier: 't', requesterId: 'requester' } }) });
		await expect(service.request(request({ listenerIds: crowd(5) }))).resolves.toEqual({ kind: 'skipped', by: 'requester' });
		expect(skipApproved).toHaveBeenCalledExactlyOnceWith('g1', undefined);
	});

	it('봇이 요청한 곡(봇 ID)은 여럿이 듣고 있어도 추천곡으로 바로 건너뛰어요', async () => {
		const { service, skipApproved } = harness({ snapshot: snapshot({ current: { identifier: 't', requesterId: BOT_ID } }) });
		await expect(service.request(request({ listenerIds: crowd(5) }))).resolves.toEqual({ kind: 'skipped', by: 'related' });
		expect(skipApproved).toHaveBeenCalledOnce();
	});

	it('추천곡 센티널이 요청자인 곡도 바로 건너뛰어요', async () => {
		const { service } = harness({ snapshot: snapshot({ current: { identifier: 't', requesterId: RELATED } }) });
		await expect(service.request(request({ listenerIds: crowd(5) }))).resolves.toEqual({ kind: 'skipped', by: 'related' });
	});

	it('음성 채널에 혼자(과반 1표)이면 투표 없이 건너뛰어요', async () => {
		const { service, skipApproved } = harness();
		await expect(service.request(request({ listenerIds: crowd(1) }))).resolves.toEqual({ kind: 'skipped', by: 'alone' });
		expect(skipApproved).toHaveBeenCalledOnce();
	});

	it('둘이 있으면 과반이 1이라 투표 없이 건너뛰어요', async () => {
		const { service } = harness();
		await expect(service.request(request({ listenerIds: crowd(2) }))).resolves.toEqual({ kind: 'skipped', by: 'alone' });
	});

	it('빈 대기열에서 봇 곡이면 추천곡 정리로 건너뛰어요', async () => {
		const { service, skipApproved } = harness({
			snapshot: snapshot({ current: { identifier: 't', requesterId: BOT_ID }, queueLength: 0, userQueuedCount: 0 })
		});
		await expect(service.request(request())).resolves.toEqual({ kind: 'skipped', by: 'related' });
		expect(skipApproved).toHaveBeenCalledExactlyOnceWith('g1', undefined);
	});

	it('빈 대기열에서 사용자 곡이면 건너뛸 노래가 없다고 거절하고 건너뛰지 않아요', async () => {
		const { service, skipApproved } = harness({ snapshot: snapshot({ queueLength: 0, userQueuedCount: 0 }) });
		const error = await rejection(service.request(request()));
		expect(error.kind).toBe('not_found');
		expect(error.ephemeral).toBe(true);
		expect(error.userMessage).toBe(VOTE_SKIP_MESSAGES.noMoreTracks());
		expect(skipApproved).not.toHaveBeenCalled();
	});

	it('재생 중인 곡이 없거나 플레이어가 없으면 거절해요', async () => {
		const none = harness({ snapshot: undefined });
		expect((await rejection(none.service.request(request()))).userMessage).toBe(VOTE_SKIP_MESSAGES.noPlayer());
		const idle = harness({ snapshot: snapshot({ current: null }) });
		expect((await rejection(idle.service.request(request()))).kind).toBe('not_found');
	});
});

describe('request: 투표 시작', () => {
	it('여럿이 듣고 다른 사람이 튼 곡이면 투표를 열고 시작자 한 표를 세요', async () => {
		const { service, skipApproved } = harness();
		await expect(service.request(request({ listenerIds: crowd(5) }))).resolves.toEqual({
			kind: 'vote-started',
			voteId: '100000000000000001',
			votes: 1,
			requiredVotes: 3
		});
		expect(skipApproved).not.toHaveBeenCalled();
	});
});

describe('request: 강제 스킵과 곡 번호 (DJ 게이트)', () => {
	it('DJ 역할이 없으면 누구나 강제 스킵할 수 있어요', async () => {
		const { service, skipApproved } = harness({ djRoleId: null });
		await expect(service.request(request({ force: true, listenerIds: crowd(5) }))).resolves.toEqual({ kind: 'skipped', by: 'forced' });
		expect(skipApproved).toHaveBeenCalledOnce();
	});

	it('DJ 역할이 있으면 보유자나 관리자만 강제 스킵할 수 있어요', async () => {
		const denied = harness({ djRoleId: 'dj' });
		const error = await rejection(denied.service.request(request({ force: true })));
		expect(error.kind).toBe('forbidden');
		expect(error.userMessage).toBe(VOTE_SKIP_MESSAGES.noPermission());
		expect(denied.skipApproved).not.toHaveBeenCalled();

		const dj = harness({ djRoleId: 'dj' });
		await expect(dj.service.request(request({ force: true, actor: actor({ roleIds: new Set(['dj']) }) }))).resolves.toEqual({
			kind: 'skipped',
			by: 'forced'
		});

		const admin = harness({ djRoleId: 'dj' });
		await expect(admin.service.request(request({ force: true, actor: actor({ isAdministrator: true }) }))).resolves.toEqual({
			kind: 'skipped',
			by: 'forced'
		});
	});

	it('서버 관리(ManageGuild)만으로는 강제 스킵 권한이 없어요 (기존 규칙 유지)', async () => {
		const { service } = harness({ djRoleId: 'dj' });
		await expect(service.request(request({ force: true, actor: actor({ canManageGuild: true }) }))).rejects.toBeInstanceOf(AppError);
	});

	it('DJ 게이트는 곡 번호 검증보다 먼저 거절해요', async () => {
		const { service, skipApproved } = harness({ djRoleId: 'dj' });
		const error = await rejection(service.request(request({ to: 1 })));
		expect(error.kind).toBe('forbidden');
		expect(skipApproved).not.toHaveBeenCalled();
	});

	it('강제 스킵 + 빈 대기열의 추천곡은 추천곡으로 정리해요', async () => {
		const { service, skipApproved } = harness({
			snapshot: snapshot({ current: { identifier: 't', requesterId: BOT_ID }, queueLength: 0, userQueuedCount: 0 })
		});
		await expect(service.request(request({ force: true, actor: actor({ isAdministrator: true }) }))).resolves.toEqual({
			kind: 'skipped',
			by: 'related'
		});
		expect(skipApproved).toHaveBeenCalledExactlyOnceWith('g1', undefined);
	});

	it('강제 스킵 + 빈 대기열의 사용자 곡은 건너뛸 노래가 없다고 거절해요', async () => {
		const { service, skipApproved } = harness({ snapshot: snapshot({ queueLength: 0, userQueuedCount: 0 }) });
		const error = await rejection(service.request(request({ force: true, actor: actor({ isAdministrator: true }) })));
		expect(error.userMessage).toBe(VOTE_SKIP_MESSAGES.noMoreTracks());
		expect(skipApproved).not.toHaveBeenCalled();
	});

	it('곡 번호를 주면 그 번호로 건너뛰어요', async () => {
		const { service, skipApproved } = harness({ snapshot: snapshot({ queueLength: 2, userQueuedCount: 2 }) });
		await expect(service.request(request({ to: 2, actor: actor({ isAdministrator: true }) }))).resolves.toEqual({
			kind: 'skipped-to',
			to: 2
		});
		expect(skipApproved).toHaveBeenCalledExactlyOnceWith('g1', { to: 2 });
	});

	it('사용자 대기곡 수를 넘는 번호는 거절해요', async () => {
		const { service, skipApproved } = harness({ snapshot: snapshot({ queueLength: 2, userQueuedCount: 1 }) });
		const error = await rejection(service.request(request({ to: 2, actor: actor({ isAdministrator: true }) })));
		expect(error.kind).toBe('not_found');
		expect(error.userMessage).toBe(VOTE_SKIP_MESSAGES.invalidIndex());
		expect(skipApproved).not.toHaveBeenCalled();
	});
});

describe('request: 예열 정리 실패 (fail-closed)', () => {
	it('mixer 정리가 실패하면 건너뛰지 않고 재시도 안내(unavailable)로 바꿔요', async () => {
		const { service } = harness({
			skipApproved: async () => {
				throw new Error('mixer down');
			}
		});
		const error = await rejection(service.request(request({ listenerIds: crowd(1) })));
		expect(error.kind).toBe('unavailable');
		expect(error.userMessage).toBe(VOTE_SKIP_MESSAGES.mixerFailed());
	});
});

describe('castVote: 투표 집계', () => {
	async function started(listenerIds: ReadonlySet<string> = crowd(5), options: HarnessOptions = {}) {
		const h = harness(options);
		await h.service.request(request({ listenerIds }));
		return h;
	}

	it('과반에 못 미치면 counted로 현재 표 수를 돌려줘요', async () => {
		const { service, skipApproved } = await started(crowd(5));
		// 5명 → 필요 3표. 시작자 1표 + m0 1표 = 2표
		await expect(service.castVote('100000000000000001', 'm0')).resolves.toEqual({ kind: 'counted', votes: 2, requiredVotes: 3 });
		expect(skipApproved).not.toHaveBeenCalled();
	});

	it('과반이 되면 곡을 건너뛰고 passed를 돌려줘요', async () => {
		const { service, skipApproved } = await started(crowd(4));
		// 4명 → 필요 2표. 시작자 1표 + m0 1표 = 2표
		await expect(service.castVote('100000000000000001', 'm0')).resolves.toEqual({ kind: 'passed', votes: 2, requiredVotes: 2 });
		expect(skipApproved).toHaveBeenCalledExactlyOnceWith('g1');
		// 끝난 투표는 닫혀 있어요
		await expect(service.castVote('100000000000000001', 'm1')).resolves.toEqual({ kind: 'closed' });
	});

	it('이미 투표한 사람은 거절해요', async () => {
		const { service } = await started(crowd(5));
		const outcome = await service.castVote('100000000000000001', 'requester');
		expect(outcome).toEqual({ kind: 'rejected', message: VOTE_SKIP_MESSAGES.alreadyVoted() });
	});

	it('음성 채널에 없는 사람의 표는 거절해요', async () => {
		const { service } = await started(crowd(5));
		const outcome = await service.castVote('100000000000000001', 'stranger');
		expect(outcome).toEqual({ kind: 'rejected', message: VOTE_SKIP_MESSAGES.notInVoice() });
	});

	it('곡이 바뀌었거나 플레이어가 끊겼으면 투표를 닫아요', async () => {
		const changed = await started(crowd(5));
		changed.setState(snapshot({ current: { identifier: 'track-2', requesterId: null } }));
		await expect(changed.service.castVote('100000000000000001', 'm0')).resolves.toEqual({ kind: 'closed' });
		expect(changed.service.closeVote('100000000000000001')).toBeNull();

		const disconnected = await started(crowd(5));
		disconnected.setState(snapshot({ connected: false }));
		await expect(disconnected.service.castVote('100000000000000001', 'm0')).resolves.toEqual({ kind: 'closed' });
	});

	it('건너뛰기가 실패하면 투표는 열린 채로 남고 다음 표로 다시 시도해요', async () => {
		let fail = true;
		const { service, skipApproved } = await started(crowd(4), {
			skipApproved: async () => {
				if (fail) {
					fail = false;
					throw new Error('boom');
				}
				return { skipped: true as const };
			}
		});
		await expect(service.castVote('100000000000000001', 'm0')).rejects.toThrow('boom');
		await expect(service.castVote('100000000000000001', 'm1')).resolves.toEqual({ kind: 'passed', votes: 3, requiredVotes: 2 });
		expect(skipApproved).toHaveBeenCalledTimes(2);
	});

	it('알 수 없는 투표 ID는 닫힘으로 돌려줘요', async () => {
		const { service } = harness();
		await expect(service.castVote('nope', 'm0')).resolves.toEqual({ kind: 'closed' });
	});
});

describe('closeVote: 시간 제한 종료', () => {
	it('진행 중이던 투표의 마지막 집계를 돌려주고 지워요', async () => {
		const { service } = harness();
		await service.request(request({ listenerIds: crowd(5) }));
		await service.castVote('100000000000000001', 'm0');
		expect(service.closeVote('100000000000000001')).toEqual({ votes: 2, requiredVotes: 3 });
		expect(service.closeVote('100000000000000001')).toBeNull();
	});
});
