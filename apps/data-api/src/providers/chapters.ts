import { Innertube, Utils, YTNodes } from 'youtubei.js';
import { getLogger } from '../utils/logger.ts';
import { youtubeClient } from './youtubeClient.ts';

const logger = getLogger('chapters');

export interface YouTubeChapter {
	name: string;
	start: number;
	end: number;
	duration: number;
}

const SEARCH_FALLBACK_MIN_DURATION_MS = 15 * 60_000;
const MAX_CONCURRENT_LOOKUPS = 4;

let activeLookups = 0;
const waitingLookups: Array<() => void> = [];

async function limitedLookup<T>(task: () => Promise<T>): Promise<T> {
	if (activeLookups >= MAX_CONCURRENT_LOOKUPS) await new Promise<void>((resolve) => waitingLookups.push(resolve));
	activeLookups++;
	try {
		return await task();
	} finally {
		activeLookups--;
		waitingLookups.shift()?.();
	}
}

function toChapters(raw: { name: string; startMs: number }[], durationMs: number): YouTubeChapter[] {
	const unique = new Map<number, string>();
	for (const item of raw) {
		if (!item.name || !Number.isFinite(item.startMs) || item.startMs < 0 || item.startMs >= durationMs) continue;
		if (!unique.has(item.startMs)) unique.set(item.startMs, item.name);
	}
	const sorted = [...unique].sort(([a], [b]) => a - b);
	if (sorted.length < 2) return [];
	return sorted.flatMap(([start, name], index) => {
		const end = sorted[index + 1]?.[0] ?? durationMs;
		return end > start ? [{ name, start, end, duration: end - start }] : [];
	});
}

async function fetchSearchChapters(youtube: Innertube, videoId: string): Promise<{ name: string; startMs: number }[]> {
	const results = await youtube.search(videoId, { type: 'video' });
	const video = results.results.find((item) => item.is(YTNodes.Video) && item.video_id === videoId);
	if (!video?.is(YTNodes.Video)) return [];
	const content = video.expandable_metadata?.expanded_content;
	if (!content?.is(YTNodes.HorizontalCardList)) return [];
	return content.cards
		.filter((item) => item.is(YTNodes.MacroMarkersListItem))
		.map((item) => ({
			name: item.title.toString(),
			startMs: Utils.timeToSeconds(item.time_description.toString()) * 1_000
		}));
}

export async function fetchYouTubeChaptersFresh(videoId: string, durationMs: number): Promise<YouTubeChapter[]> {
	if (!videoId || durationMs <= 0) return [];
	return limitedLookup(async () => {
		const youtube = await youtubeClient();
		let infoFailed = false;
		try {
			const info = await youtube.getInfo(videoId);
			const markers = info.player_overlays?.decorated_player_bar?.player_bar?.markers_map;
			const chapters = markers?.find((marker) => marker.marker_key === 'DESCRIPTION_CHAPTERS')?.value.chapters ?? [];
			if (chapters.length > 0) {
				return toChapters(
					chapters.map((chapter) => ({ name: chapter.title.toString(), startMs: chapter.time_range_start_millis })),
					durationMs
				);
			}
		} catch (error) {
			infoFailed = true;
			logger.debug(`video info lookup failed for ${videoId}: ${String(error)}`);
		}

		if (durationMs >= SEARCH_FALLBACK_MIN_DURATION_MS) {
			try {
				return toChapters(await fetchSearchChapters(youtube, videoId), durationMs);
			} catch (error) {
				logger.debug(`search chapter lookup failed for ${videoId}: ${String(error)}`);
				throw new Error('YouTube chapter lookup failed');
			}
		}
		if (infoFailed) throw new Error('YouTube chapter lookup failed');
		return [];
	});
}

export function chaptersCacheKey(videoId: string, durationMs: number): string {
	return `dataapi:v2:chapters:${videoId}:${durationMs}`;
}
