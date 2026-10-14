import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuildMember, Collection as DiscordCollection, VoiceBasedChannel } from 'discord.js';
import type { Player, Queue, Track } from 'lavalink-client';
import { AudioService, type SkipContext } from './audioService.ts';

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

const service = new AudioService();

async function expectUserError(promise: Promise<void>, identifier: string) {
	await expect(promise).rejects.toMatchObject({ identifier, context: { ephemeral: true } });
}

describe('handleSkip branch matrix', () => {
	beforeEach(() => {
		hasDJRole.mockReset();
		mixerSkip.mockReset().mockResolvedValue(undefined);
	});

	it('skips immediately when the requester started the current track (no vote)', async () => {
		const context = makeContext({ requesterId: 'requester', queueTracks: [track('other-user')] });
		await service.handleSkip(context, false, 0);
		expect(mixerSkip).toHaveBeenCalledWith(context.player);
		expect(context.interaction.reply).toHaveBeenCalledTimes(1);
	});

	it('skips bot-requested tracks without a vote even when others are listening', async () => {
		const context = makeContext({ requesterId: 'bot-self', members: 5, queueTracks: [track('other-user')] });
		await service.handleSkip(context, false, 0);
		expect(mixerSkip).toHaveBeenCalled();
		expect(context.interaction.reply).toHaveBeenCalled();
	});

	it('skips without a vote when the member is alone in the voice channel', async () => {
		const context = makeContext({ requesterId: 'someone-else', members: 1, queueTracks: [track('other-user')] });
		await service.handleSkip(context, false, 0);
		expect(mixerSkip).toHaveBeenCalled();
		expect(context.interaction.reply).toHaveBeenCalled();
	});

	it('starts a vote when others are listening and the track was requested by someone else', async () => {
		const context = makeContext({ requesterId: 'someone-else', members: 5, queueTracks: [track('other-user')] });
		await service.handleSkip(context, false, 0);
		expect(mixerSkip).not.toHaveBeenCalled();
		expect(context.interaction.reply).toHaveBeenCalledTimes(1); // VoteSkip 투표 컴포넌트
	});

	it('skips a bot-requested track even when the queue is empty (related track cleanup)', async () => {
		const context = makeContext({ requesterId: 'bot-self', members: 3, queueTracks: [] });
		await service.handleSkip(context, false, 0);
		expect(mixerSkip).toHaveBeenCalledWith(context.player, 0);
		expect(context.interaction.reply).toHaveBeenCalled();
	});

	it('rejects an empty-queue skip of a user-requested track', async () => {
		const context = makeContext({ requesterId: 'requester', queueTracks: [] });
		await expectUserError(service.handleSkip(context, false, 0), 'skip_no_more_tracks');
		expect(mixerSkip).not.toHaveBeenCalled();
	});

	it('force skip requires the DJ role', async () => {
		hasDJRole.mockResolvedValue(false);
		const context = makeContext({ requesterId: 'someone-else', members: 5 });
		await expectUserError(service.handleSkip(context, true, 0), 'forceskip_no_permission');
		expect(mixerSkip).not.toHaveBeenCalled();
	});

	it('force skip with the DJ role skips immediately', async () => {
		hasDJRole.mockResolvedValue(true);
		const context = makeContext({ requesterId: 'someone-else', members: 5, queueTracks: [track('other-user')] });
		await service.handleSkip(context, true, 0);
		expect(mixerSkip).toHaveBeenCalled();
		expect(context.interaction.reply).toHaveBeenCalled();
	});

	it('skip-to rejects an index beyond the user queue', async () => {
		hasDJRole.mockResolvedValue(true);
		const context = makeContext({ requesterId: 'someone-else', queueTracks: [track('u2'), track('u3')] });
		await expectUserError(service.handleSkip(context, false, 3), 'skipto_invalid_index');
	});

	it('skip-to jumps to the requested queue position', async () => {
		hasDJRole.mockResolvedValue(true);
		const target = track('u3');
		const context = makeContext({ requesterId: 'someone-else', queueTracks: [track('u2'), target] });
		await service.handleSkip(context, false, 2);
		expect(mixerSkip).toHaveBeenCalledWith(context.player, 2);
		expect(context.interaction.reply).toHaveBeenCalled();
	});
});
