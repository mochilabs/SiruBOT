import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../lib/appError.ts';
import { MUSIC_ACCESS_MESSAGES } from './access.ts';
import type { Actor } from './actor.ts';
import { createMusicPlay, MUSIC_SEARCH_MESSAGES, type MusicPlayDeps, type PlaySearchOutcome } from './play.ts';

interface FakePlayer {
	id: string;
}
interface FakeTrack {
	info: { identifier: string; title: string };
}
interface FakePlaylist {
	selectedTrack: FakeTrack | null;
}

const BOT_CHANNEL = 'vc-bot';

function actor(overrides: Partial<Actor> = {}): Actor {
	return {
		guildId: 'guild',
		userId: 'user',
		voiceChannelId: BOT_CHANNEL,
		isAdministrator: false,
		canManageGuild: false,
		roleIds: new Set<string>(),
		humansInVoiceChannel: 1,
		...overrides
	};
}

function track(id: string): FakeTrack {
	return { info: { identifier: id, title: id } };
}

function harness(
	options: {
		botChannel?: string | null;
		djRole?: string | null;
		outcome?: PlaySearchOutcome<FakeTrack, FakePlaylist>;
		wasIdle?: boolean;
	} = {}
) {
	const botChannel = options.botChannel === undefined ? BOT_CHANNEL : options.botChannel;
	const player: FakePlayer = { id: 'player' };
	const outcome = options.outcome ?? { loadType: 'track' as const, tracks: [track('a')], playlist: null };

	const getOrCreatePlayer = vi.fn<MusicPlayDeps<FakePlayer, FakeTrack, FakePlaylist>['getOrCreatePlayer']>(async () => player);
	const search = vi.fn<MusicPlayDeps<FakePlayer, FakeTrack, FakePlaylist>['search']>(async () => outcome);
	const searchWithoutPlayer = vi.fn<MusicPlayDeps<FakePlayer, FakeTrack, FakePlaylist>['searchWithoutPlayer']>(async () => outcome);
	const connect = vi.fn<MusicPlayDeps<FakePlayer, FakeTrack, FakePlaylist>['connect']>(async () => undefined);
	const enqueue = vi.fn<MusicPlayDeps<FakePlayer, FakeTrack, FakePlaylist>['enqueue']>(async () => ({ wasIdle: options.wasIdle ?? true }));
	const ensurePlayback = vi.fn<MusicPlayDeps<FakePlayer, FakeTrack, FakePlaylist>['ensurePlayback']>(async () => undefined);

	const musicPlay = createMusicPlay<FakePlayer, FakeTrack, FakePlaylist>({
		access: { getBotVoiceChannelId: () => botChannel, getDjRoleId: async () => options.djRole ?? null },
		getOrCreatePlayer,
		search,
		searchWithoutPlayer,
		connect,
		enqueue,
		ensurePlayback
	});
	return { musicPlay, player, getOrCreatePlayer, search, connect, enqueue, ensurePlayback, searchWithoutPlayer };
}

const request = {
	query: '곡',
	platform: 'ytsearch' as const,
	requester: { id: 'user', username: 'user' },
	textChannelId: 'text'
};

async function rejection(promise: Promise<unknown>): Promise<AppError> {
	const error = await promise.then(
		() => null,
		(thrown: unknown) => thrown
	);
	expect(error).toBeInstanceOf(AppError);
	return error as AppError;
}

describe('createMusicPlay: 곡을 넣을 음성 채널 정책', () => {
	it('봇과 같은 음성 채널에 있으면 봇 채널의 플레이어에 곡을 넣고 재생을 보장한다', async () => {
		const h = harness();

		const result = await h.musicPlay.play(actor({ voiceChannelId: BOT_CHANNEL }), request, { kind: 'first' });

		expect(h.getOrCreatePlayer).toHaveBeenCalledWith('guild', BOT_CHANNEL, 'text', { pinText: false });
		expect(h.connect).toHaveBeenCalledWith(h.player);
		expect(h.enqueue).toHaveBeenCalledWith(h.player, [track('a')]);
		expect(h.ensurePlayback).toHaveBeenCalledWith(h.player);
		expect(result).toMatchObject({ voiceChannelId: BOT_CHANNEL, wasIdle: true, queued: [track('a')], remaining: [] });
	});

	it('봇과 다른 음성 채널에 있으면 거절하고 플레이어를 건드리지 않는다', async () => {
		const h = harness();

		const error = await rejection(h.musicPlay.play(actor({ voiceChannelId: 'vc-other' }), request, { kind: 'first' }));

		expect(error.kind).toBe('forbidden');
		expect(error.userMessage).toBe(MUSIC_ACCESS_MESSAGES.sameVoiceRequired());
		expect(h.getOrCreatePlayer).not.toHaveBeenCalled();
		expect(h.enqueue).not.toHaveBeenCalled();
	});

	it('음성 채널에 없는 일반 사용자는 거절한다', async () => {
		const h = harness();

		const error = await rejection(h.musicPlay.play(actor({ voiceChannelId: null }), request, { kind: 'first' }));

		expect(error.userMessage).toBe(MUSIC_ACCESS_MESSAGES.voiceRequired());
		expect(h.getOrCreatePlayer).not.toHaveBeenCalled();
	});

	it('원격 권한자는 음성 채널 밖에 있어도 봇이 있는 채널에 곡을 넣는다', async () => {
		const h = harness();

		const result = await h.musicPlay.play(actor({ voiceChannelId: null, canManageGuild: true }), request, { kind: 'first' });

		expect(h.getOrCreatePlayer).toHaveBeenCalledWith('guild', BOT_CHANNEL, 'text', { pinText: false });
		expect(result.voiceChannelId).toBe(BOT_CHANNEL);
	});

	it('봇이 아직 음성 채널에 없으면 요청자의 채널로 플레이어를 만든다', async () => {
		const h = harness({ botChannel: null });

		const result = await h.musicPlay.play(actor({ voiceChannelId: 'vc-user' }), request, { kind: 'first' });

		expect(h.getOrCreatePlayer).toHaveBeenCalledWith('guild', 'vc-user', 'text', { pinText: false });
		expect(result.voiceChannelId).toBe('vc-user');
	});

	it('봇이 없고 원격 권한자가 음성 채널 밖이면 들어갈 채널이 없어 거절한다', async () => {
		const h = harness({ botChannel: null });

		const error = await rejection(h.musicPlay.play(actor({ voiceChannelId: null, isAdministrator: true }), request, { kind: 'first' }));

		expect(error.userMessage).toBe(MUSIC_ACCESS_MESSAGES.voiceRequired());
		expect(h.getOrCreatePlayer).not.toHaveBeenCalled();
	});

	it('고정 채널 입력이면 기존 플레이어의 텍스트 채널도 맞추도록 요청한다', async () => {
		const h = harness();

		await h.musicPlay.search(actor(), { ...request, pinTextChannel: true });

		expect(h.getOrCreatePlayer).toHaveBeenCalledWith('guild', BOT_CHANNEL, 'text', { pinText: true });
	});
});

describe('createMusicPlay: 넣을 곡 범위', () => {
	const playlistOutcome: PlaySearchOutcome<FakeTrack, FakePlaylist> = {
		loadType: 'playlist',
		tracks: [track('a'), track('b'), track('c')],
		playlist: { selectedTrack: track('b') }
	};

	it('selected 범위는 플레이리스트의 선택 곡만 넣고 나머지는 돌려준다', async () => {
		const h = harness({ outcome: playlistOutcome });

		const result = await h.musicPlay.play(actor(), request, { kind: 'selected' });

		expect(h.enqueue).toHaveBeenCalledWith(h.player, [track('b')]);
		expect(result.queued).toEqual([track('b')]);
		expect(result.remaining).toEqual([track('a'), track('c')]);
	});

	it('selected 범위에서 선택 곡이 없으면 플레이리스트 전체를 넣는다', async () => {
		const h = harness({ outcome: { ...playlistOutcome, playlist: { selectedTrack: null } } });

		const result = await h.musicPlay.play(actor(), request, { kind: 'selected' });

		expect(result.queued).toEqual([track('a'), track('b'), track('c')]);
		expect(result.remaining).toEqual([]);
	});

	it('all 범위는 limit까지만 넣고 나머지는 remaining으로 돌려준다', async () => {
		const h = harness({ outcome: playlistOutcome });

		const result = await h.musicPlay.play(actor(), request, { kind: 'all', limit: 2 });

		expect(result.queued).toEqual([track('a'), track('b')]);
		expect(result.remaining).toEqual([track('c')]);
	});

	it('first 범위는 플레이리스트여도 첫 곡 하나만 넣는다', async () => {
		const h = harness({ outcome: playlistOutcome });

		const result = await h.musicPlay.play(actor(), request, { kind: 'first' });

		expect(result.queued).toEqual([track('a')]);
	});
});

describe('createMusicPlay: 검색 결과와 후속 호출', () => {
	it('결과가 없으면 not_found로 거절하고 접속·대기열 추가를 하지 않는다', async () => {
		const h = harness({ outcome: { loadType: 'search', tracks: [], playlist: null } });

		const error = await rejection(h.musicPlay.play(actor(), request, { kind: 'first' }));

		expect(error.kind).toBe('not_found');
		expect(error.userMessage).toBe(MUSIC_SEARCH_MESSAGES.empty());
		expect(h.connect).not.toHaveBeenCalled();
		expect(h.enqueue).not.toHaveBeenCalled();
	});

	it('enqueue와 startPlayback은 고른 곡을 대기열에 넣고 재생을 보장한다 (검색 뒤 선택 흐름)', async () => {
		const h = harness();
		const found = await h.musicPlay.search(actor(), request);

		const { wasIdle } = await h.musicPlay.enqueue(found.player, track('a'));
		await h.musicPlay.startPlayback(found.player);

		expect(wasIdle).toBe(true);
		expect(h.enqueue).toHaveBeenLastCalledWith(h.player, track('a'));
		expect(h.ensurePlayback).toHaveBeenCalledTimes(1);
	});

	it('preview는 인가만 거쳐 플레이어 없이 검색한다 (웹 미리보기)', async () => {
		const h = harness();

		const outcome = await h.musicPlay.preview(actor({ voiceChannelId: 'vc-other' }), request).catch((error: unknown) => error);

		expect(outcome).toBeInstanceOf(AppError);
		expect(h.searchWithoutPlayer).not.toHaveBeenCalled();

		const allowed = await h.musicPlay.preview(actor(), request);
		expect(allowed.tracks).toEqual([track('a')]);
		expect(h.getOrCreatePlayer).not.toHaveBeenCalled();
	});
});
