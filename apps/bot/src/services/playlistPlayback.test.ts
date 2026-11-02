import { beforeEach, describe, expect, it, vi } from 'vitest';
import { playSavedTracks, type PlaylistPlaybackContext } from './playlistPlayback.ts';

const mocks = vi.hoisted(() => ({
	audio: { getPlayer: vi.fn(), nodeManager: { leastUsedNodes: vi.fn() } },
	guildService: { getDefaultTextChannel: vi.fn() },
	audioService: { getOrCreatePlayer: vi.fn(), connectPlayer: vi.fn(), enqueueTrack: vi.fn(), ensurePlayback: vi.fn() },
	search: vi.fn()
}));
vi.mock('@sapphire/framework', () => ({
	container: mocks,
	UserError: class extends Error {
		constructor(options: { message: string }) {
			super(options.message);
		}
	}
}));
const tracks = [{ track: { title: '곡', url: 'https://example.com/song', source: 'youtube' } }];
const context = () =>
	({
		guildId: 'guild',
		channelId: 'text',
		member: { voice: { channelId: 'voice', deaf: false } },
		user: { id: 'user' }
	}) as unknown as PlaylistPlaybackContext;

describe('저장한 목록 재생', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.audio.nodeManager.leastUsedNodes.mockReturnValue([{ search: mocks.search }]);
		mocks.audioService.getOrCreatePlayer.mockResolvedValue({ paused: false });
		mocks.search.mockResolvedValue({ tracks: [{ info: { title: '곡' } }] });
	});
	it('다른 음성 채널의 재생에는 곡을 추가하지 않아요', async () => {
		mocks.audio.getPlayer.mockReturnValue({ voiceChannelId: 'other' });
		await expect(playSavedTracks(context(), tracks)).rejects.toThrow('같은 음성 채널');
		expect(mocks.search).not.toHaveBeenCalled();
		expect(mocks.audioService.enqueueTrack).not.toHaveBeenCalled();
	});
	it('전부 검색 실패하면 플레이어를 만들거나 성공 안내를 하지 않아요', async () => {
		mocks.search.mockResolvedValue({ tracks: [] });
		await expect(playSavedTracks(context(), tracks)).rejects.toThrow('아무 곡도 추가하지 않았어요');
		expect(mocks.audioService.getOrCreatePlayer).not.toHaveBeenCalled();
	});
	it('검색 중 음성 채널이 바뀌면 이전 채널에 연결하지 않아요', async () => {
		const input = context();
		mocks.search.mockImplementation(async () => {
			Object.assign(input.member.voice, { channelId: 'moved' });
			return { tracks: [{}] };
		});
		await expect(playSavedTracks(input, tracks)).rejects.toThrow('음성 채널이 바뀌었어요');
		expect(mocks.audioService.connectPlayer).not.toHaveBeenCalled();
	});
	it('일시정지는 유지하면서 곡을 추가해요', async () => {
		mocks.audioService.getOrCreatePlayer.mockResolvedValue({ paused: true });
		await expect(playSavedTracks(context(), tracks)).resolves.toContain('일시정지 상태를 유지');
		expect(mocks.audioService.enqueueTrack).toHaveBeenCalledOnce();
		expect(mocks.audioService.ensurePlayback).not.toHaveBeenCalled();
	});
	it('추가 후 재생 실패는 중복 추가 대신 재개로 안내해요', async () => {
		mocks.audioService.ensurePlayback.mockRejectedValue(new Error('offline'));
		await expect(playSavedTracks(context(), tracks)).resolves.toContain('곡은 이미 추가');
		expect(mocks.audioService.enqueueTrack).toHaveBeenCalledOnce();
	});
});
