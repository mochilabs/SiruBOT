import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiToolContext } from './types.ts';

const { announce, getPlayer, checkDJOrAlone } = vi.hoisted(() => ({ announce: vi.fn(), getPlayer: vi.fn(), checkDJOrAlone: vi.fn() }));

vi.mock('@sapphire/framework', () => ({ container: { audio: { getPlayer }, mixerService: { announce } } }));
vi.mock('../../modules/audio/utils/permissionCheck.ts', () => ({ checkDJOrAlone }));
vi.mock('../../modules/audio/lavalink/autoPlayRelated.ts', () => ({ getUserQueuedTracks: vi.fn(), removeStaleRelatedTracks: vi.fn() }));
vi.mock('../dataApiClient.ts', () => ({ searchLyrics: vi.fn() }));

import { musicTools } from './music.ts';

const musicTts = musicTools.find((tool) => tool.name === 'music_tts');
if (!musicTts) throw new Error('music_tts tool not registered');

const ctx = {
	guildId: 'g1',
	channelId: 'c1',
	voiceChannelId: 'v1',
	member: {} as AiToolContext['member'],
	userId: 'u1',
	username: 'user'
} satisfies AiToolContext;

beforeEach(() => {
	vi.clearAllMocks();
	checkDJOrAlone.mockResolvedValue(true);
	getPlayer.mockReturnValue({ guildId: 'g1' });
	announce.mockResolvedValue({ guildId: 'g1', id: 1, position: 1, queueLength: 1 });
});
afterEach(() => vi.unstubAllGlobals());

describe('music_tts ai tool (queued announce)', () => {
	it('returns the queue position from the 202 receipt', async () => {
		announce.mockResolvedValue({ guildId: 'g1', id: 4, position: 3, queueLength: 3 });

		const result = JSON.parse(await musicTts.execute({ text: '안녕하세요' }, ctx)) as { status: string; speaking: string; position: number };

		expect(result).toEqual({ status: 'ok', speaking: '안녕하세요', position: 3 });
		const [, identifier, duckLevel] = announce.mock.calls[0] as [unknown, string, number];
		expect(identifier).toContain('translate.google.com');
		expect(duckLevel).toBe(0.2);
	});

	it('reports a failed enqueue without blaming a busy overlay', async () => {
		announce.mockRejectedValue(new Error('mixer down'));

		await expect(musicTts.execute({ text: '안녕하세요' }, ctx)).rejects.toThrow('음성 안내를 예약하지 못했어요');
	});
});
