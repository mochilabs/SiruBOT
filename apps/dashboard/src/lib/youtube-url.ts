/**
 * 유튜브 링크 판별 유틸 — 정규식의 단일 소스예요. 프론트(hooks)와 서버 라우트
 * (src/app/api/playlists/[id]/tracks/route.ts)가 같은 패턴으로 링크를 인식하게 해요.
 */
const YOUTUBE_URL_PATTERN = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})/;

/** 입력값이 유튜브 영상 링크인지 확인해요. 앞뒤 공백은 무시해요. */
export function isYoutubeUrl(value: string): boolean {
	return YOUTUBE_URL_PATTERN.test(value.trim());
}

/** 링크에서 11자리 비디오 ID를 뽑아요. 유튜브 링크가 아니면 null을 반환해요. */
export function extractYoutubeVideoId(value: string): string | null {
	const match = value.trim().match(YOUTUBE_URL_PATTERN);
	return match ? match[1] : null;
}
