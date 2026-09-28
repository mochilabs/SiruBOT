import { container } from '@sapphire/framework';
import { Player, Track, UnresolvedTrack } from 'lavalink-client';
import { CustomPlayer } from './player/customPlayer.ts';
import { isYouTubeSource } from './youtubeChapters.ts';

// ── Similarity Threshold Settings ──
// Above HIGH_SIMILARITY: Too similar tracks like translated versions, covers (exclude)
// Below LOW_SIMILARITY: Unrelated tracks (exclude)
const HIGH_SIMILARITY = Number(process.env.AUTOPLAY_HIGH_SIM) || 0.75;
const LOW_SIMILARITY = Number(process.env.AUTOPLAY_LOW_SIM) || 0.2;

// Similarity weights (sum = 1.0)
const TITLE_WEIGHT = 0.6;
const DURATION_WEIGHT = 0.4;

// 이미 재생했던 곡의 순위 강등량 — 밴드 판정이 아니라 랭킹에만 적용한다
const PREVIOUS_PLAY_PENALTY = 0.4;

// trackStart 선예열(queueRelatedUpfront)과 queueEnd fallback(autoPlayRelated)의
// 이중 추가를 막는 길드별 in-flight 가드
const relatedFetchInFlight = new Map<string, Promise<Track | null>>();

/** 진행 중인 추천곡 프리페치를 반환한다 (handleQueueEnd가 완료를 기다릴 때 사용) */
export function getInFlightRelatedFetch(guildId: string): Promise<Track | null> | undefined {
	return relatedFetchInFlight.get(String(guildId));
}

/** 봇이 자동으로 넣은 추천곡인지 판별한다 (requester.id === 'related_track') */
export function isRelatedTrack(track: Track | UnresolvedTrack): boolean {
	const requester = (track as { requester?: unknown }).requester;
	const requesterId = requester && typeof requester === 'object' ? (requester as { id?: unknown }).id : requester;
	return requesterId === 'related_track';
}

/**
 * 큐에 남아 있는 선예열 추천곡을 제거한다.
 * 추천곡은 "큐가 비어 있을 때 현재 곡 기준"으로 만들어진 것이므로 그대로 두면
 * 사용자가 추가한 곡보다 먼저 재생된다 — 사용자 곡이 그 자리를 잇도록 replace 한다.
 * 반드시 `queue.add` "이후"에 부른다 (이전에 부르면 그 사이에 빈 큐를 본 선예열
 * fetch가 다시 추가할 수 있다). 제거한 개수를 반환하며, 서버 예열 슬롯 갱신은
 * 호출부의 preload가 담당한다.
 */
export async function removeStaleRelatedTracks(player: Player): Promise<number> {
	const tracks = player.queue.tracks;
	const relatedIndexes: number[] = [];
	for (let i = 0; i < tracks.length; i++) {
		if (isRelatedTrack(tracks[i])) relatedIndexes.push(i);
	}
	if (relatedIndexes.length === 0) return 0;

	// 뒤에서부터 지워야 인덱스가 밀리지 않는다. queue.splice를 쓰면
	// tracksRemoved 콜백과 utils.save()(큐 저장소 동기화)까지 함께 처리된다.
	for (let i = relatedIndexes.length - 1; i >= 0; i--) {
		await player.queue.splice(relatedIndexes[i], 1);
	}
	container.logger.debug(`[autoPlayRelated] Removed ${relatedIndexes.length} pre-added related track(s) for user add (guild ${player.guildId})`);
	return relatedIndexes.length;
}

/**
 * Normalize title: convert to lowercase, remove bracketed content (feat., remix, etc.), remove special characters, trim whitespace
 */
export function normalizeTitle(title: string): string {
	return title
		.toLowerCase()
		.replace(/\s*[\(\[\{].*?[\)\]\}]\s*/g, '') // Remove (Official MV), [Lyrics], {Remix}, etc.
		.replace(/\s*[-–—|].*$/, '') // Remove " - Topic", " | Official Audio", etc.
		.replace(/[^\p{L}\p{N}\s]/gu, '') // Remove special characters (keep Unicode letters, numbers, and whitespace)
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Generate a set of bigrams (2-character pairs) from a string
 */
function getBigrams(str: string): string[] {
	const bigrams: string[] = [];
	for (let i = 0; i < str.length - 1; i++) {
		bigrams.push(str.substring(i, i + 2));
	}
	return bigrams;
}

/**
 * Dice coefficient (Bigram similarity): 0 = completely different, 1 = identical
 * Measures how similar two tracks are based on their titles
 */
export function titleSimilarity(titleA: string, titleB: string): number {
	const a = normalizeTitle(titleA);
	const b = normalizeTitle(titleB);

	// 괄호/특수문자만 남아 정규화가 비어버린 제목은 비교 불가 — 0으로 두고
	// (a === b === "")이 유사도 1.0이 되어 완전히 다른 곡들이 "너무 유사"로
	// 전량 배제되는 일을 막는다.
	if (a.length === 0 || b.length === 0) return 0;
	if (a === b) return 1;
	if (a.length < 2 || b.length < 2) return 0;

	const bigramsA = getBigrams(a);
	const bigramsB = getBigrams(b);

	const bigramCountB = new Map<string, number>();
	for (const bg of bigramsB) {
		bigramCountB.set(bg, (bigramCountB.get(bg) ?? 0) + 1);
	}

	let intersectionSize = 0;
	for (const bg of bigramsA) {
		const count = bigramCountB.get(bg) ?? 0;
		if (count > 0) {
			intersectionSize++;
			bigramCountB.set(bg, count - 1);
		}
	}

	return (2 * intersectionSize) / (bigramsA.length + bigramsB.length);
}

/**
 * Duration similarity: Returns a value between 0 and 1 indicating how similar the lengths of two tracks are
 * 1 if identical, closer to 0 as the difference increases
 */
export function durationSimilarity(durationA: number, durationB: number): number {
	if (durationA === 0 && durationB === 0) return 1;
	const maxDuration = Math.max(durationA, durationB);
	if (maxDuration === 0) return 1;

	return 1 - Math.abs(durationA - durationB) / maxDuration;
}

/**
 * Overall similarity: Sum of title similarity (60%) and duration similarity (40%)
 */
export function trackSimilarity(trackA: Track, trackB: Track): number {
	const titleSim = titleSimilarity(trackA.info.title, trackB.info.title);
	const durationSim = durationSimilarity(trackA.info.duration, trackB.info.duration);

	return titleSim * TITLE_WEIGHT + durationSim * DURATION_WEIGHT;
}

/**
 * Select the most suitable recommended track based on similarity
 * - Too similar tracks (translated versions, covers) → excluded
 * - Too different tracks → excluded
 * - Select the most appropriate track from the medium similarity range
 */
export function pickBySimilarity(candidates: Track[], reference: Track, previousIds: string[] = []): Track | null {
	if (candidates.length === 0) return null;

	const scored = candidates.map((track) => {
		const similarity = trackSimilarity(reference, track);
		// 이미 재생했던 곡은 순위를 낮춘다. 이 감점은 아래 밴드 판정에 쓰이지 않는다 —
		// 감점을 밴드 필터 이전에 적용하면 "너무 유사"했던 곡이 감점으로 밴드 안에
		// 들어오고, 적당했던 곡은 LOW 미만으로 떨어져 완전히 배제됐다.
		const playedBefore = previousIds.includes(track.info.identifier);
		return { track, similarity, rank: similarity - (playedBefore ? PREVIOUS_PLAY_PENALTY : 0) };
	});

	// 원점수 기준으로 중간 밴드만 후보로 삼는다 (너무 유사/너무 무관한 곡 배제)
	let pool = scored.filter((s) => s.similarity > LOW_SIMILARITY && s.similarity < HIGH_SIMILARITY);

	// 밴드에 드는 곡이 없으면 하한만 완화한다 (커버·번역곡 배제는 유지)
	if (pool.length === 0) pool = scored.filter((s) => s.similarity < HIGH_SIMILARITY);

	// 전부 너무 유사하면 그래도 재생을 이어가기 위해 전체를 후보로 쓴다
	if (pool.length === 0) pool = scored;

	// 감점 반영 순위로 정렬한 뒤 상위 3개 중 랜덤 선택 (다양성 확보)
	pool.sort((a, b) => b.rank - a.rank);
	const topN = pool.slice(0, Math.min(3, pool.length));
	const pick = topN[Math.floor(Math.random() * topN.length)];

	container.logger.debug(
		`[autoPlayRelated] Picked track by similarity: "${pick.track.info.title}" (score: ${pick.similarity.toFixed(3)}, rank: ${pick.rank.toFixed(3)})`
	);
	return pick.track;
}

/**
 * 현재 곡의 YouTube RD(Radio) 플레이리스트를 검색해 유사도 기반으로 추천곡을 고른다.
 * 순수 검색+선택만 담당하며 큐 상태 검사는 호출부에서 fetch 완료 후 한다. 실패 시 null.
 */
async function fetchRelatedCandidate(player: Player, lastPlayedTrack: Track): Promise<Track | null> {
	const RD_PLAYLIST_ID = 'RD' + lastPlayedTrack.info.identifier;

	try {
		const searchResult = await player.node.search('https://youtube.com/playlist?list=' + RD_PLAYLIST_ID, {
			id: 'related_track',
			username: null
		});
		container.logger.debug(`Search result loadType: ${searchResult.loadType}, tracks: ${searchResult.tracks.length}`);

		if (searchResult.loadType === 'error' || searchResult.loadType === 'empty') {
			container.logger.debug(`Related search failed (${searchResult.loadType}): ${lastPlayedTrack.info.identifier}`);
			return null;
		}

		// Instead of completely filtering out previous tracks, we just filter out the currently playing track.
		// The previous tracks will be passed into pickBySimilarity and get heavily penalized.
		const previous = player.queue.previous.map((e) => e.info.identifier);
		if (player.queue.current) previous.push(player.queue.current.info.identifier);

		const availableTracks = searchResult.tracks.filter((track) => track.info.identifier !== lastPlayedTrack.info.identifier);

		if (availableTracks.length > 0) {
			const selectedTrack = pickBySimilarity(availableTracks, lastPlayedTrack, previous);
			if (selectedTrack) return selectedTrack;
		}

		container.logger.debug(`No unique related tracks found for: ${lastPlayedTrack.info.identifier}`);
		return null;
	} catch (error) {
		container.logger.error(`Error fetching related tracks: ${error}`);
		return null;
	}
}

/**
 * trackStart 시점에 대기열이 비어 있으면(현재 곡이 마지막) 추천곡을 미리 큐에 추가해
 * mixer 예열 슬롯을 채운다 — 서버가 content end에 갭리스(+크로스페이드)로 이어준다.
 * 재생 중이 아니면(예: fetch 동안 곡이 끝남) 예열하지 않는다. queueEnd 핸들러가
 * 큐에 추가된 곡을 직접 시작한다 — 예열하면 서버가 같은 곡을 다시 틀린다.
 * 반환값: 추가한 추천곡 (추가하지 않았으면 null)
 */
export const queueRelatedUpfront = async (player: CustomPlayer, currentTrack: Track): Promise<Track | null> => {
	const gid = String(player.guildId);
	if (relatedFetchInFlight.has(gid)) return null;
	const currentEncoded = (currentTrack as { encoded?: unknown }).encoded;
	const operation = (async (): Promise<Track | null> => {
		const relatedOn = await container.guildService.getRelated(player.guildId);
		if (!relatedOn || player.repeatMode !== 'off') return null;
		if (!currentTrack.info.identifier || !isYouTubeSource(currentTrack.info.sourceName)) return null;

		const settings = await container.guildService.getMixerSettings(gid);
		if (!settings.gaplessEnabled) return null;

		const selectedTrack = await fetchRelatedCandidate(player, currentTrack);
		if (!selectedTrack) return null;

		const activeEncoded = (player.queue.current as { encoded?: unknown } | null)?.encoded;
		// fetch 동안 정지하거나 다른 곡으로 전이됐으면 이전 곡 기준 추천을 추가하지 않는다.
		if (player.getData('stopByCommand') || player.queue.tracks.length > 0 || (player.playing && activeEncoded !== currentEncoded)) return null;

		await player.queue.add(selectedTrack);
		if (player.playing) {
			// 서버가 재생 중 → 슬롯에 예열 (trackEnd 관망은 TrackHandler가 처리)
			await container.mixerService.preloadUpcoming(player).catch(() => null);
		}
		return selectedTrack;
	})();
	relatedFetchInFlight.set(gid, operation);
	try {
		return await operation;
	} finally {
		if (relatedFetchInFlight.get(gid) === operation) relatedFetchInFlight.delete(gid);
	}
};

export const autoPlayRelated = async (player: Player, lastPlayedTrack: Track): Promise<void> => {
	const relatedOn = await container.guildService.getRelated(player.guildId);
	if (player.repeatMode == 'off' && relatedOn) {
		if (lastPlayedTrack.info.identifier && isYouTubeSource(lastPlayedTrack.info.sourceName)) {
			// trackStart 선예열이 진행 중이면 이중 추가 방지 (선예열쪽이 재생을 이어준다)
			if (relatedFetchInFlight.has(String(player.guildId))) {
				container.logger.debug('[autoPlayRelated] Pre-add in flight, skipping fallback');
				return;
			}

			// Prevent race condition
			const currentRequester = player.queue.current?.requester as { id: string } | undefined;
			if ((player.queue.current && currentRequester?.id !== 'related_track') || player.queue.tracks.length > 0) {
				container.logger.debug('[autoPlayRelated] Prevent race condition: user added track');
				return;
			}

			const selectedTrack = await fetchRelatedCandidate(player, lastPlayedTrack);
			if (!selectedTrack) {
				// 추천 곡을 찾지 못하면 조용히 종료한다.
				// 종료 안내는 queueEnd 핸들러(handleQueueEnd)가 한 번만 보낸다. (2연타 방지)
				return;
			}

			// 검색 동안 상태가 변했는지 재확인 (사용자가 곡을 추가했으면 넘어간다)
			const recheckRequester = player.queue.current?.requester as { id: string } | undefined;
			if ((player.queue.current && recheckRequester?.id !== 'related_track') || player.queue.tracks.length > 0) {
				container.logger.debug('[autoPlayRelated] Prevent race condition after search: user added track');
				return;
			}

			await player.queue.add(selectedTrack);
		}
	}
};
