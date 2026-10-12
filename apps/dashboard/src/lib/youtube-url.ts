/**
 * 유튜브 링크 판별 유틸 — 서버 라우트(src/app/api/playlists/[id]/tracks/route.ts)와
 * 동일한 정규식을 써서, 프론트에서 링크로 걸러낸 값이 서버에서도 항상 같은 링크로 인식되게 해요.
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
