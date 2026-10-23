import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuildMember, Collection as DiscordCollection, VoiceBasedChannel } from 'discord.js';
import type { Player, Queue, Track } from 'lavalink-client';
import { SkipPolicy, type SkipContext } from './skipPolicy.ts';

const { hasDJRole, mixerSkip } = vi.hoisted(() => ({ hasDJRole: vi.fn(), mixerSkip: vi.fn() }));

vi.mock('@sapphire/framework', () => ({
	UserError: class UserError extends Error {
		public identifier: string;
		public context: unknown;
		public constructor(options: { identifier: string; message: string; context?: unknown }) {
			super(options.message);
			this.name = 'UserError';
			this.identifier = options.identifier;
			this.context = options.context;
		}
	},
	container: { guildService: { hasDJRole }, mixerService: { skip: mixerSkip }, client: { user: { id: 'bot-self' } } }
}));

function track(requesterId: string, identifier = `id-${requesterId}`): Track {
	return { encoded: `enc-${identifier}`, info: { identifier, title: '곡' }, requester: { id: requesterId } } as unknown as Track;
}

function members(size: number) {
	return { size } as unknown as DiscordCollection<string, GuildMember>;
}

function makeContext(overrides: { requesterId?: string; queueTracks?: Track[]; members?: number } = {}): SkipContext {
	const currentTrack = track(overrides.requesterId ?? 'requester');
	const queueTracks = overrides.queueTracks ?? [];
	return {
		player: { guildId: 'g1', queue: { tracks: queueTracks, previous: [] } } as unknown as Player,
		queue: { tracks: queueTracks } as unknown as Queue,
		currentTrack,
		interaction: {
			guildId: 'g1',
			user: { id: 'requester' },
			member: {} as GuildMember,
			reply: vi.fn(async () => undefined),
			editReply: vi.fn(async () => undefined),
			channel: undefined
		} as never,
		voiceChannel: {} as VoiceBasedChannel,
		voiceChannelMembers: members(overrides.members ?? 3)
	};
}

const policy = new SkipPolicy();

async function expectUserError(promise: Promise<unknown>, identifier: string) {
	await expect(promise).rejects.toMatchObject({ identifier, context: { ephemeral: true } });
}

describe('handleSkip branch matrix', () => {
	beforeEach(() => {
		hasDJRole.mockReset();
		mixerSkip.mockReset().mockResolvedValue(undefined);
	});

	it('skips immediately when the requester started the current track (no vote)', async () => {
		const context = makeContext({ requesterId: 'requester', queueTracks: [track('other-user')] });
		await policy.handleSkip(context, false, 0);
		expect(mixerSkip).toHaveBeenCalledWith(context.player, undefined);
		expect(context.interaction.reply).toHaveBeenCalledTimes(1);
	});

	it('skips bot-requested tracks without a vote even when others are listening', async () => {
		const context = makeContext({ requesterId: 'bot-self', members: 5, queueTracks: [track('other-user')] });
		await policy.handleSkip(context, false, 0);
		expect(mixerSkip).toHaveBeenCalled();
		expect(context.interaction.reply).toHaveBeenCalled();
	});

	it('skips without a vote when the member is alone in the voice channel', async () => {
		const context = makeContext({ requesterId: 'someone-else', members: 1, queueTracks: [track('other-user')] });
		await policy.handleSkip(context, false, 0);
		expect(mixerSkip).toHaveBeenCalled();
		expect(context.interaction.reply).toHaveBeenCalled();
	});

	it('starts a vote when others are listening and the track was requested by someone else', async () => {
		const context = makeContext({ requesterId: 'someone-else', members: 5, queueTracks: [track('other-user')] });
		await policy.handleSkip(context, false, 0);
		expect(mixerSkip).not.toHaveBeenCalled();
		expect(context.interaction.reply).toHaveBeenCalledTimes(1); // VoteSkip 투표 컴포넌트
	});

	it('skips a bot-requested track even when the queue is empty (related track cleanup)', async () => {
		const context = makeContext({ requesterId: 'bot-self', members: 3, queueTracks: [] });
		await policy.handleSkip(context, false, 0);
		expect(mixerSkip).toHaveBeenCalledWith(context.player, 0);
		expect(context.interaction.reply).toHaveBeenCalled();
	});

	it('rejects an empty-queue skip of a user-requested track', async () => {
		const context = makeContext({ requesterId: 'requester', queueTracks: [] });
		await expectUserError(policy.handleSkip(context, false, 0), 'skip_no_more_tracks');
		expect(mixerSkip).not.toHaveBeenCalled();
	});

	it('force skip requires the DJ role', async () => {
		hasDJRole.mockResolvedValue(false);
		const context = makeContext({ requesterId: 'someone-else', members: 5 });
		await expectUserError(policy.handleSkip(context, true, 0), 'forceskip_no_permission');
		expect(mixerSkip).not.toHaveBeenCalled();
	});

	it('force skip with the DJ role skips immediately', async () => {
		hasDJRole.mockResolvedValue(true);
		const context = makeContext({ requesterId: 'someone-else', members: 5, queueTracks: [track('other-user')] });
		await policy.handleSkip(context, true, 0);
		expect(mixerSkip).toHaveBeenCalled();
		expect(context.interaction.reply).toHaveBeenCalled();
	});

	it('skip-to rejects an index beyond the user queue', async () => {
		hasDJRole.mockResolvedValue(true);
		const context = makeContext({ requesterId: 'someone-else', queueTracks: [track('u2'), track('u3')] });
		await expectUserError(policy.handleSkip(context, false, 3), 'skipto_invalid_index');
	});

	it('skip-to jumps to the requested queue position', async () => {
		hasDJRole.mockResolvedValue(true);
		const target = track('u3');
		const context = makeContext({ requesterId: 'someone-else', queueTracks: [track('u2'), target] });
		await policy.handleSkip(context, false, 2);
		expect(mixerSkip).toHaveBeenCalledWith(context.player, 2);
		expect(context.interaction.reply).toHaveBeenCalled();
	});
});

describe('mixer slot fail-closed', () => {
	it('surfaces a user error when the preheated slot could not be cleared', async () => {
		const context = makeContext({ requesterId: 'bot-self', members: 3, queueTracks: [] });
		mixerSkip.mockRejectedValueOnce(new Error('mixer down'));
		await expectUserError(policy.handleSkip(context, false, 0), 'skip_mixer_failed');
		expect(context.interaction.reply).not.toHaveBeenCalled();
	});
});

/** private 정책 메서드를 규칙 단위로 검사하기 위한 캐스트 */
type UncheckedSkipPolicy = {
	checkDJRole(context: SkipContext): Promise<void>;
	handleForceSkip(context: SkipContext): Promise<void>;
};
const unchecked = policy as unknown as UncheckedSkipPolicy;

describe('DJ 역할 게이트·강제 스킵 규칙 (단위)', () => {
	beforeEach(() => {
		hasDJRole.mockReset();
		mixerSkip.mockReset().mockResolvedValue(undefined);
	});

	it('checkDJRole은 DJ 역할이 있으면 거절 없이 통과한다', async () => {
		hasDJRole.mockResolvedValue(true);
		await expect(unchecked.checkDJRole(makeContext())).resolves.toBeUndefined();
	});

	it('checkDJRole은 DJ 역할이 없으면 일시적인 사용자 오류로 거절한다', async () => {
		hasDJRole.mockResolvedValue(false);
		await expectUserError(unchecked.checkDJRole(makeContext()), 'forceskip_no_permission');
	});

	it('강제 스킵은 DJ 게이트를 통과한 뒤에만 mixer 스킵을 실행한다', async () => {
		hasDJRole.mockResolvedValue(false);
		const context = makeContext({ requesterId: 'someone-else', members: 5, queueTracks: [track('other-user')] });
		await expectUserError(policy.handleSkip(context, true, 0), 'forceskip_no_permission');
		expect(mixerSkip).not.toHaveBeenCalled();
	});

	it('곡 지정 스킵도 DJ 역할 없이는 인덱스 검증보다 먼저 거절된다', async () => {
		hasDJRole.mockResolvedValue(false);
		const context = makeContext({ requesterId: 'someone-else', queueTracks: [track('u2')] });
		await expectUserError(policy.handleSkip(context, false, 1), 'forceskip_no_permission');
		expect(mixerSkip).not.toHaveBeenCalled();
	});

	it('강제 스킵 + 빈 큐는 DJ 통과 후 건너뛸 곡이 없음을 알린다', async () => {
		hasDJRole.mockResolvedValue(true);
		const context = makeContext({ requesterId: 'requester', queueTracks: [] });
		await expectUserError(policy.handleSkip(context, true, 0), 'skip_no_more_tracks');
		expect(mixerSkip).not.toHaveBeenCalled();
	});

	it('강제 스킵 + 빈 큐의 추천곡은 mixer로 정리한다', async () => {
		hasDJRole.mockResolvedValue(true);
		const context = makeContext({ requesterId: 'bot-self', queueTracks: [] });
		await policy.handleSkip(context, true, 0);
		expect(mixerSkip).toHaveBeenCalledWith(context.player, 0);
	});

	it('handleForceSkip은 DJ 재확인 없이 스킵하고 응답한다', async () => {
		const context = makeContext({ requesterId: 'someone-else', members: 5, queueTracks: [track('other-user')] });
		await unchecked.handleForceSkip(context);
		expect(mixerSkip).toHaveBeenCalledWith(context.player, undefined);
		expect(context.interaction.reply).toHaveBeenCalledTimes(1);
	});
});
