/**
 * Lavalink 트랙 소스 유틸 — 봇 services·modules 양쪽이 쓰는 순수 헬퍼 위치 (services→modules 역방향 import 해소용).
 * 챕터 fetch/파싱은 data-api 게이트웨이(apps/data-api/src/providers/chapters.ts)가 담당해요.
 */

/** 장문 영상에서만 챕터가 의미 있으므로 이 미만은 조회하지 않는다. */
export const CHAPTER_FETCH_MIN_DURATION_MS = 15 * 60 * 1000;

/**
 * 유튜브 계열 소스인지.
 * 소스 플러그인은 base 이름 뒤에 접미사를 붙여 내려주므로 prefix로 판별한다.
 */
export function isYouTubeSource(sourceName: string | null | undefined): boolean {
	return Boolean(sourceName?.startsWith('youtube'));
}

/** 트랙에서 YouTube videoId를 얻는다. 유튜브 소스의 identifier가 곧 videoId다. */
export function resolveYouTubeVideoId(track: { info?: { sourceName?: string; identifier?: string } } | null | undefined): string | null {
	if (!track?.info || !isYouTubeSource(track.info.sourceName)) return null;
	const identifier = track.info.identifier;
	return identifier && identifier.length > 0 ? identifier : null;
}