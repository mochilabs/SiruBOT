import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LavalinkManager, type Track } from 'lavalink-client';
import {
	normalizeTitle,
	titleSimilarity,
	pickBySimilarity,
	fetchRelatedCandidate,
	autoPlayRelated,
	isRelatedTrack,
	queueRelatedUpfront
} from './autoPlayRelated.ts';
import { handleMixerNeedNext } from './handlers/mixerHandlers.ts';
import { RELATED_TRACK_REQUESTER_ID } from './requester.ts';
import { RelatedTrackHistory } from './player/relatedTrackHistory.ts';
import { CustomPlayer } from './player/customPlayer.ts';

const { container } = vi.hoisted(() => ({
	container: {
		logger: { trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
		mixerService: {
			isPreloaded: vi.fn(() => false),
			preloadUpcoming: vi.fn(async () => undefined),
			prepareNextAnalysis: vi.fn(async () => undefined),
			arm: vi.fn(async () => undefined),
			supportsOutgoingEnd: vi.fn(async () => false),
			invalidate: vi.fn(async () => undefined)
		},
		guildService: {
			getRelated: vi.fn(async () => false),
			getMixerSettings: vi.fn(async () => ({
				gaplessEnabled: true,
				crossfadeEnabled: false,
				automixEnabled: false
			}))
		}
	}
}));

vi.mock('@sapphire/framework', () => ({ container }));
vi.mock('../../../services/sponsorBlockService.ts', () => ({
	sponsorBlockService: {
		prefetch: vi.fn(),
		queueChanged: vi.fn(),
		outgoingEndPositionMs: vi.fn(() => undefined)
	}
}));

function track(title: string, identifier: string, duration = 100_000, extra: Record<string, unknown> = {}): Track {
	return {
		info: { title, identifier, duration, sourceName: 'youtube' },
		encoded: `enc-${identifier}`,
		...extra
	} as unknown as Track;
}

describe('isRelatedTrack', () => {
	it('null/undefined는 추천곡이 아니다', () => {
		expect(isRelatedTrack(null)).toBe(false);
		expect(isRelatedTrack(undefined)).toBe(false);
	});

	it('requester.id가 추천곡 센티널이면 true다', () => {
		expect(isRelatedTrack(track('related song', 'rel-1', 100_000, { requester: { id: RELATED_TRACK_REQUESTER_ID } }))).toBe(true);
	});

	it('일반 유저 트랙은 requester.id가 달라 false다', () => {
		expect(isRelatedTrack(track('user song', 'usr-1', 100_000, { requester: { id: '123456789012345678' } }))).toBe(false);
	});

	it('requester가 없는 트랙은 false다', () => {
		expect(isRelatedTrack(track('plain song', 'plain-1'))).toBe(false);
	});
});

describe('normalizeTitle', () => {
	it('strips bracketed suffixes, separators and special characters', () => {
		expect(normalizeTitle('Song Name (Official MV)')).toBe('song name');
		expect(normalizeTitle('Song Name [Lyrics]')).toBe('song name');
		expect(normalizeTitle('Artist - Topic')).toBe('artist');
		expect(normalizeTitle('Title | Official Audio')).toBe('title');
	});

	it('collapses whitespace and keeps unicode letters', () => {
		expect(normalizeTitle('  봄    사랑   노래  ')).toBe('봄 사랑 노래');
		expect(normalizeTitle('Hello!! World...')).toBe('hello world');
	});
});

describe('titleSimilarity', () => {
	it('returns 1 for identical titles and 0 for titles that normalize to empty', () => {
		expect(titleSimilarity('Nightcore', 'NIGHTCORE')).toBe(1);
		expect(titleSimilarity('(...)!!!', '[[[]]]')).toBe(0);
	});

	it('returns 0 when either side is too short to compare', () => {
		expect(titleSimilarity('ab', 'a')).toBe(0);
		expect(titleSimilarity('abcd', 'a')).toBe(0);
	});

	it('computes the dice coefficient of normalized bigrams', () => {
		// 'abcd' vs 'abce' → 공통 bigram ab,bc (2개) / 전체 bigram 3+3 → 2*2/6
		expect(titleSimilarity('abcd', 'abce')).toBeCloseTo(2 / 3, 5);
		expect(titleSimilarity('abcd', 'wxyz')).toBe(0);
	});
});

describe('pickBySimilarity bands', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('empty candidates → null', () => {
		expect(pickBySimilarity([], track('abcd', 'ref'))).toBeNull();
	});

	it('picks the mid-band candidate and drops too-similar and too-different ones', () => {
		const reference = track('abcd', 'ref', 100_000);
		// 동일 제목+동일 길이 → 유사도 1.0 (≥ HIGH) → 상위 밴드에서 제외
		const tooSimilar = track('abcd', 'dup', 100_000);
		// titleSim 2/3, durSim 0.5 → 0.6*2/3 + 0.4*0.5 = 0.6 (중간 밴드)
		const mid = track('abce', 'mid', 200_000);
		// titleSim 0, durSim 0.1 → 0.04 (< LOW) → 하위 제외
		const tooDifferent = track('wxyz', 'diff', 1_000_000);

		const picked = pickBySimilarity([tooSimilar, mid, tooDifferent], reference);
		expect(picked).toBe(mid);
	});

	it('relaxes only the lower bound when no mid-band candidate exists', () => {
		const reference = track('abcd', 'ref', 100_000);
		const unrelated = track('wxyz', 'diff', 1_000_000); // 0.04 → 밴드1 제외, 밴드2(<HIGH)에는 포함
		expect(pickBySimilarity([unrelated], reference)).toBe(unrelated);
	});

	it('falls back to all candidates when everything is too similar', () => {
		const reference = track('abcd', 'ref', 100_000);
		const identical = track('abcd', 'dup', 100_000); // 1.0 → 밴드1·2 모두 제외 → 밴드3(전체)
		expect(pickBySimilarity([identical], reference)).toBe(identical);
	});
});

describe('fetchRelatedCandidate hard exclusions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	function makePlayer(searchResult: { loadType: string; tracks: Track[] }) {
		const search = vi.fn(async () => searchResult);
		return {
			node: { search },
			relatedTrackHistory: new RelatedTrackHistory(),
			queue: {
				current: track('current song', 'current-id', 90_000),
				previous: [track('past song', 'previous-id', 80_000)],
				tracks: [track('waiting song', 'waiting-id', 70_000)]
			}
		} as unknown as Parameters<typeof fetchRelatedCandidate>[0];
	}

	it('hard-excludes current/previous/queued identifiers from the search results', async () => {
		const reference = track('abcd', 'ref', 100_000);
		const midCandidate = track('abce', 'fresh-mid', 200_000); // 유사도 0.6 → 유일한 중간 밴드
		const player = makePlayer({
			loadType: 'search',
			tracks: [
				track('current song', 'current-id', 90_000), // 큐 current → 하드 제외
				track('past song', 'previous-id', 80_000), // 재생 이력 → 하드 제외
				track('waiting song', 'waiting-id', 70_000), // 대기열 → 하드 제외
				track('abcd', 'ref', 100_000), // 마지막 재생 곡 자신 → 하드 제외
				midCandidate
			]
		});

		const selected = await fetchRelatedCandidate(player, reference);
		expect(selected).toBe(midCandidate);
	});

	it('applies extraExcludes for consecutive picks in the same request', async () => {
		const reference = track('abcd', 'ref', 100_000);
		const secondCandidate = track('abce', 'second', 200_000);
		const player = makePlayer({
			loadType: 'search',
			tracks: [
				track('abce', 'first', 200_000), // extraExcludes에 이미 있음 → 제외
				secondCandidate
			]
		});

		const selected = await fetchRelatedCandidate(player, reference, ['first']);
		expect(selected).toBe(secondCandidate);
	});

	it('returns null when every candidate is hard-excluded', async () => {
		const reference = track('abcd', 'ref', 100_000);
		const player = makePlayer({
			loadType: 'search',
			tracks: [track('current song', 'current-id', 90_000), track('past song', 'previous-id', 80_000)]
		});

		expect(await fetchRelatedCandidate(player, reference)).toBeNull();
	});

	it('does not recommend a played track after it leaves the 25-track queue history', async () => {
		const played = track('first song', 'first-id');
		const player = makePlayer({ loadType: 'playlist', tracks: [played] });
		player.queue.current = null;
		player.queue.previous.splice(0);
		await fetchRelatedCandidate(player, played);

		player.queue.previous.push(...Array.from({ length: 25 }, (_, i) => track(`later song ${i}`, `later-${i}`)));
		expect(await fetchRelatedCandidate(player, player.queue.previous[0])).toBeNull();
	});

	it('excludes another upload of a played recording before similarity fallbacks', async () => {
		const played = track('Siru - Blue Hour (Official Video)', 'original-id');
		played.info.author = 'Siru - Topic';
		const otherUpload = track('Siru - Blue Hour [Lyrics]', 'other-upload-id');
		otherUpload.info.author = 'SIRU';
		const player = makePlayer({ loadType: 'playlist', tracks: [otherUpload] });
		player.queue.previous.splice(0, player.queue.previous.length, played);

		expect(await fetchRelatedCandidate(player, track('another song', 'ref'))).toBeNull();
	});

	it('keeps distinct songs with the same artist prefix eligible', async () => {
		const played = track('Siru - Blue Hour', 'original-id');
		played.info.author = 'Siru';
		const differentSong = track('Siru - Afterglow', 'new-id');
		differentSong.info.author = 'Siru';
		const player = makePlayer({ loadType: 'playlist', tracks: [differentSong] });
		player.queue.previous.splice(0, player.queue.previous.length, played);

		expect(await fetchRelatedCandidate(player, track('another song', 'ref'))).toBe(differentSong);
	});

	it.each([
		{ title: 'Blue Hour (Live)', author: 'Siru', duration: 100_000 },
		{ title: 'Blue Hour', author: 'Another Artist', duration: 100_000 },
		{ title: 'Blue Hour', author: 'Siru', duration: 200_000 }
	])('keeps distinct recordings eligible: %j', async ({ title, author, duration }) => {
		const played = track('Blue Hour', 'original-id');
		played.info.author = 'Siru';
		const differentRecording = track(title, 'other-id', duration);
		differentRecording.info.author = author;
		const player = makePlayer({ loadType: 'playlist', tracks: [differentRecording] });
		player.queue.previous.splice(0, player.queue.previous.length, played);
		expect(await fetchRelatedCandidate(player, track('another song', 'ref'))).toBe(differentRecording);
	});

	it('excludes the same ISRC even when the upload metadata differs', async () => {
		const played = track('Blue Hour', 'original-id');
		played.info.isrc = 'US-AAA-26-00001';
		const otherUpload = track('another upload title', 'other-id');
		otherUpload.info.isrc = 'usaaa2600001';
		const player = makePlayer({ loadType: 'playlist', tracks: [otherUpload] });
		player.queue.previous.splice(0, player.queue.previous.length, played);
		expect(await fetchRelatedCandidate(player, track('another song', 'ref'))).toBeNull();
	});

	it('allows a removed, unplayed queued track to be recommended later', async () => {
		const waiting = track('waiting song', 'waiting-id');
		const player = makePlayer({ loadType: 'playlist', tracks: [waiting] });
		const reference = track('another song', 'ref');
		expect(await fetchRelatedCandidate(player, reference)).toBeNull();
		player.queue.tracks.splice(0);
		expect(await fetchRelatedCandidate(player, reference)).toBe(waiting);
	});

	it('does not permanently exclude an unplayed current track from a queue shift', async () => {
		const waiting = track('waiting song', 'waiting-id');
		const player = makePlayer({ loadType: 'playlist', tracks: [waiting] });
		player.queue.current = waiting;
		player.queue.tracks.splice(0);
		const reference = track('another song', 'ref');
		expect(await fetchRelatedCandidate(player, reference)).toBeNull();
		player.queue.current = null;
		expect(await fetchRelatedCandidate(player, reference)).toBe(waiting);
	});

	it.each([undefined, null, ['invalid', 123]])('accepts legacy or malformed saved history: %j', async (saved) => {
		const candidate = track('new song', 'new-id');
		const player = makePlayer({ loadType: 'playlist', tracks: [candidate] });
		player.relatedTrackHistory.restore(saved);
		expect(await fetchRelatedCandidate(player, track('another song', 'ref'))).toBe(candidate);
	});

	it('retains session exclusions through real queue truncation and player serialization', async () => {
		const manager = new LavalinkManager<CustomPlayer>({
			nodes: [{ id: 'test', host: 'localhost', port: 2333, authorization: 'test' }],
			sendToShard: () => undefined,
			client: { id: '123456789012345678' },
			playerClass: CustomPlayer
		});
		const original = manager.createPlayer({ guildId: '123456789012345679', voiceChannelId: '123456789012345680', node: 'test' });
		const played = track('first song', 'first-id');
		original.relatedTrackHistory.remember(played);
		original.queue.previous.push(...Array.from({ length: 25 }, (_, i) => track(`later song ${i}`, `later-${i}`)), played);
		await original.queue.utils.save();
		expect(original.queue.previous).toHaveLength(25);
		expect(original.queue.previous).not.toContain(played);

		const restored = makePlayer({ loadType: 'playlist', tracks: [played] });
		restored.relatedTrackHistory.restore(JSON.parse(JSON.stringify(original.toJSON().relatedTrackHistory)));
		expect(await fetchRelatedCandidate(restored, track('another song', 'ref'))).toBeNull();
		const nextSession = makePlayer({ loadType: 'playlist', tracks: [played] });
		expect(await fetchRelatedCandidate(nextSession, track('another song', 'ref'))).toBe(played);
	});

	it('returns null on error or empty search results', async () => {
		const reference = track('abcd', 'ref', 100_000);
		expect(await fetchRelatedCandidate(makePlayer({ loadType: 'empty', tracks: [] }), reference)).toBeNull();

		const errorPlayer = {
			relatedTrackHistory: new RelatedTrackHistory(),
			node: {
				search: vi.fn(async () => {
					throw new Error('node down');
				})
			},
			queue: { current: null, previous: [], tracks: [] }
		} as unknown as Parameters<typeof fetchRelatedCandidate>[0];
		expect(await fetchRelatedCandidate(errorPlayer, reference)).toBeNull();
	});
});

describe('autoPlayRelated transition gate', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		(container.mixerService.isPreloaded as ReturnType<typeof vi.fn>).mockReturnValue(false);
	});

	function gatePlayer(transitionState: Record<string, unknown> = {}) {
		return {
			guildId: 'g',
			repeatMode: 'off',
			transitionState,
			queue: { current: null, tracks: [], previous: [] }
		} as never;
	}

	it('skips while the server-side transition is in flight (preheated slot)', async () => {
		(container.mixerService.isPreloaded as ReturnType<typeof vi.fn>).mockReturnValue(true);
		await autoPlayRelated(gatePlayer(), track('Current', 'current-id'));
		expect(container.guildService.getRelated).not.toHaveBeenCalled();
	});

	it('skips right after a preheated slot was consumed', async () => {
		await autoPlayRelated(gatePlayer({ preloadConsumedAt: Date.now() }), track('Current', 'current-id'));
		expect(container.guildService.getRelated).not.toHaveBeenCalled();
	});

	it('runs normally outside the confirm window', async () => {
		await autoPlayRelated(gatePlayer({ preloadConsumedAt: Date.now() - 60_000 }), track('Current', 'current-id'));
		expect(container.guildService.getRelated).toHaveBeenCalled();
	});
});

describe('queueRelatedUpfront with AutoMix (gapless=false)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(container.guildService.getRelated).mockResolvedValue(true);
		vi.mocked(container.guildService.getMixerSettings).mockResolvedValue({
			gaplessEnabled: false,
			crossfadeEnabled: true,
			automixEnabled: true
		});
		vi.mocked(container.mixerService.isPreloaded).mockReturnValue(false);
	});

	function createPlayerWithCandidate(recommendedTrack: Track) {
		const currentTrack = track('abcd', 'ref-1', 100_000);
		const tracks: Track[] = [];
		const player = {
			guildId: 'g-upfront',
			playing: true,
			repeatMode: 'off',
			transitionState: { stopByCommand: false },
			currentEpoch: 1,
			mixerRuntime: {
				pending: new Map(),
				lastTargetUid: null,
				invalidateTimer: null
			},
			relatedTrackHistory: new RelatedTrackHistory(),
			node: {
				search: vi.fn(async () => ({
					loadType: 'playlist',
					tracks: [recommendedTrack]
				}))
			},
			queue: {
				current: currentTrack,
				previous: [] as Track[],
				tracks,
				add: vi.fn(async (t: Track) => {
					tracks.push(t);
				})
			}
		};
		return { player, currentTrack };
	}

	it('gapless=false, crossfade=true, automix=true이고 빈 큐일 때 추천곡을 큐에 추가하고 예열한다', async () => {
		const recommended = track('abce', 'rec-1', 200_000);
		const { player, currentTrack } = createPlayerWithCandidate(recommended);

		const added = await queueRelatedUpfront(player as never, currentTrack);

		expect(added).toBe(recommended);
		expect(player.queue.tracks).toHaveLength(1);
		expect(player.queue.tracks[0]).toBe(recommended);
		expect(container.mixerService.preloadUpcoming).toHaveBeenCalledWith(player);
	});

	it('같은 조건에서 handleMixerNeedNext 호출 시 추천곡으로 비어있지 않게 arm한다', async () => {
		const recommended = track('abce', 'rec-1', 200_000);
		const { player, currentTrack } = createPlayerWithCandidate(recommended);

		await queueRelatedUpfront(player as never, currentTrack);
		await handleMixerNeedNext(player as never, {
			remainingMs: 2000,
			currentTrackEncoded: currentTrack.encoded!
		});

		expect(container.mixerService.arm).toHaveBeenCalledWith(
			player,
			expect.objectContaining({
				isEmpty: false,
				encodedTrack: recommended.encoded
			}),
			expect.any(String)
		);
	});
});
