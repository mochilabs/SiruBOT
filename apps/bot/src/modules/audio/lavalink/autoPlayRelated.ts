import { container } from '@sapphire/framework';
import { DEFAULT_COLOR } from '@sirubot/utils';
import { ContainerBuilder, MessageFlags } from 'discord.js';
import { Player, Track } from 'lavalink-client';

// ── Similarity Threshold Settings ──
// Above HIGH_SIMILARITY: Too similar tracks like translated versions, covers (exclude)
// Below LOW_SIMILARITY: Unrelated tracks (exclude)
const HIGH_SIMILARITY = 0.75;
const LOW_SIMILARITY = 0.2;

// Similarity weights (sum = 1.0)
const TITLE_WEIGHT = 0.6;
const DURATION_WEIGHT = 0.4;

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
		let similarity = trackSimilarity(reference, track);

		// Apply penalty if the track has been played previously to lower its priority
		if (previousIds.includes(track.info.identifier)) {
			similarity -= 0.4;
		}

		return { track, similarity };
	});

	// Filter medium similarity range: exclude tracks that are too similar or too different
	const mediumRange = scored.filter((s) => s.similarity > LOW_SIMILARITY && s.similarity < HIGH_SIMILARITY);

	if (mediumRange.length > 0) {
		// Sort by similarity within the medium range, then randomly select from the top 3 (to ensure variety)
		mediumRange.sort((a, b) => b.similarity - a.similarity);
		const topN = mediumRange.slice(0, Math.min(3, mediumRange.length));
		const pick = topN[Math.floor(Math.random() * topN.length)];

		container.logger.debug(`[autoPlayRelated] Picked track by similarity: "${pick.track.info.title}" (score: ${pick.similarity.toFixed(3)})`);
		return pick.track;
	}

	// If no tracks in medium range, exclude too similar ones and pick randomly from the rest
	const notTooSimilar = scored.filter((s) => s.similarity < HIGH_SIMILARITY);
	if (notTooSimilar.length > 0) {
		const pick = notTooSimilar[Math.floor(Math.random() * notTooSimilar.length)];
		container.logger.debug(`[autoPlayRelated] Fallback pick: "${pick.track.info.title}" (score: ${pick.similarity.toFixed(3)})`);
		return pick.track;
	}

	// If all tracks are too similar (e.g., all translated versions/covers), just pick randomly
	container.logger.debug('[autoPlayRelated] All candidates too similar, picking random');
	return candidates[Math.floor(Math.random() * candidates.length)];
}

export const autoPlayRelated = async (player: Player, lastPlayedTrack: Track): Promise<void> => {
	const relatedOn = await container.guildService.getRelated(player.guildId);
	if (player.repeatMode == 'off' && relatedOn) {
		if (lastPlayedTrack.info.identifier && lastPlayedTrack.info.sourceName == 'youtube') {
			const RD_PLAYLIST_ID = 'RD' + lastPlayedTrack.info.identifier;

			try {
				const searchResult = await player.node.search('https://youtube.com/playlist?list=' + RD_PLAYLIST_ID, {
					id: 'related_track',
					username: null
				});
				container.logger.debug(`Search result: ${JSON.stringify(searchResult)}`);

				if (searchResult.loadType !== 'error' && searchResult.loadType !== 'empty') {
					// Prevent race condition
					const currentRequester = player.queue.current?.requester as any;
					if ((player.queue.current && currentRequester?.id !== 'related_track') || player.queue.tracks.length > 0) {
						container.logger.debug('[autoPlayRelated] Prevent race condition: user added track');
						return;
					}

					const previous = player.queue.previous.map((e) => e.info.identifier);
					if (player.queue.current) previous.push(player.queue.current.info.identifier);

					// Instead of completely filtering out previous tracks, we just filter out the currently playing track.
					// The previous tracks will be passed into pickBySimilarity and get heavily penalized.
					const availableTracks = searchResult.tracks.filter((track) => track.info.identifier !== lastPlayedTrack.info.identifier);

					if (availableTracks.length > 0) {
						const selectedTrack = pickBySimilarity(availableTracks, lastPlayedTrack, previous);
						if (selectedTrack) {
							player.queue.add(selectedTrack);
							return;
						}
					}

					container.logger.debug(`No unique related tracks found for: ${lastPlayedTrack.info.identifier}`);
				} else {
					container.logger.debug(`Related search failed (${searchResult.loadType}): ${lastPlayedTrack.info.identifier}`);
				}
			} catch (error) {
				container.logger.error(`Error fetching related tracks: ${error}`);
			}

			// If no recommended track is found: end playback + notify
			await sendEndNotification(player, '📭 추천 곡을 찾지 못해 재생을 종료했어요.');
		}
	}
};

async function sendEndNotification(player: Player, message: string) {
	if (!player.textChannelId) return;
	try {
		const channel = await container.client.channels.fetch(player.textChannelId);
		if (channel?.isSendable()) {
			await channel.send({
				components: [
					new ContainerBuilder().setAccentColor(DEFAULT_COLOR).addTextDisplayComponents((textDisplay) => textDisplay.setContent(message))
				],
				flags: [MessageFlags.IsComponentsV2]
			});
		}
	} catch (error) {
		container.logger.error(`Failed to send autoplay notification: ${error}`);
	}
}
