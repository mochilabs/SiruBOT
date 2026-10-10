import { Track } from 'lavalink-client';
import { isYouTubeSource } from '../modules/audio/lavalink/youtubeChapters.ts';

export function extractTrackData(track: Track) {
	const info = track.info;
	const id: string = info.identifier;
	const title: string = info.title ?? '(제목 없음)';
	const artist: string = info.author ?? 'Unknown Artist';
	const duration: number = info.duration ?? 0;
	const url: string = info.uri ?? '';
	const source: string = info.sourceName ?? 'unknown';
	const thumbnail: string | null =
		info.artworkUrl ?? (isYouTubeSource(info.sourceName) && id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null);

	return { id, title, artist, duration, url, source, thumbnail };
}
