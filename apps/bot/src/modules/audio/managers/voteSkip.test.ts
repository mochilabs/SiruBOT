import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Collection } from 'discord.js';
import type { GuildMember } from 'discord.js';
import { VoteSkip, requiredSkipVotes } from './voteSkip.ts';

function members(count: number): Collection<string, GuildMember> {
	return new Collection(Array.from({ length: count }, (_, i) => [`m${i}`, {} as GuildMember])) as Collection<string, GuildMember>;
}

function makeVoteSkip(memberCount: number, voterIds: string[] = ['starter']) {
	const voiceChannelMembers = members(memberCount);
	const voteSkip = new VoteSkip({
		player: { connected: true, queue: { current: { info: { identifier: 'track-1' } } } } as never,
		currentTrack: { info: { identifier: 'track-1' } } as never,
		voiceChannelMembers,
		interaction: { user: { id: 'starter' } } as never
	});
	return { voteSkip: voteSkip as unknown as { [key: string]: any }, voterIds, voiceChannelMembers };
}

describe('requiredSkipVotes (과반 스킵 표 수)', () => {
	it('음성 채널 인원의 절반을 올림한 값이 필요 표 수다', () => {
		expect(requiredSkipVotes(members(0))).toBe(0);
		expect(requiredSkipVotes(members(1))).toBe(1);
		expect(requiredSkipVotes(members(2))).toBe(1);
		expect(requiredSkipVotes(members(3))).toBe(2);
		expect(requiredSkipVotes(members(4))).toBe(2);
		expect(requiredSkipVotes(members(9))).toBe(5);
	});

	it('혼자 있으면 과반이 1이 되어 단독 스킵으로 이어진다 (audioService.isUserAlone 규칙)', () => {
		expect(requiredSkipVotes(members(1))).toBe(1);
		expect(requiredSkipVotes(members(2))).toBe(1);
	});
});

describe('VoteSkip 투표 검증', () => {
	beforeEach(() => vi.clearAllMocks());

	it('시작자는 이미 참여자로 잡히고, 같은 사람의 재투표를 막는다', () => {
		const { voteSkip } = makeVoteSkip(3);
		expect(voteSkip.validateVote('starter')).toBe('❌ 이미 투표에 참여했어요.');
	});

	it('음성 채널에 없는 사용자의 투표를 막는다', () => {
		const { voteSkip } = makeVoteSkip(3);
		expect(voteSkip.validateVote('stranger')).toBe('❌ 음성 채널에 접속한 사용자만 투표에 참여할 수 있어요.');
	});

	it('채널에 있는 미참여자에게는 null(수용)을 돌려준다', () => {
		const { voteSkip } = makeVoteSkip(4);
		expect(voteSkip.validateVote('m1')).toBeNull();
		// 4명이면 필요 표 수는 2 — 시작자 1표에 이어서 한 표가 더 모이면 완료 조건에 닿는다
		expect(voteSkip.voteState.requiredVotes).toBe(2);
	});
});
