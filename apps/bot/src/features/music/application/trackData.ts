import { Track } from 'lavalink-client';
import { isYouTubeSource } from '@sirubot/utils';

export function extractTrackData(track: Track) {
	const info = track.info;
	// identifier는 플러그인 제공값이라 비어 있을 수 있다 (파일 캐시/서버 시작 트랙 등).
	// 비어 있으면 항상 존재하는 uri로 폴백해 Track.id(비필수 PK)가 undefined/빈 값이 되지 않게 한다.
	const id: string = info.identifier && info.identifier.length > 0 ? info.identifier : (info.uri ?? '');
	const title: string = info.title ?? '(제목 없음)';
	const artist: string = info.author ?? '(아티스트 정보 없음)';
	const duration: number = info.duration ?? 0;
	const url: string = info.uri ?? '';
	const source: string = info.sourceName ?? 'unknown';
	const thumbnail: string | null =
		info.artworkUrl ?? (isYouTubeSource(info.sourceName) && id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null);

	return { id, title, artist, duration, url, source, thumbnail };
}
