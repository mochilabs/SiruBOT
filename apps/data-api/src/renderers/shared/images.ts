/**
 * 카드용 원격 이미지 허용 목록 — 도메인 allowlist로 SSRF를 막아요 (보안 경계).
 */

/** 이미지 fetch 허용 호스트 — Discord CDN + 유튜브 썸네일만. */
const IMAGE_ALLOW_HOSTS = new Set(['cdn.discordapp.com', 'media.discordapp.net', 'i.ytimg.com', 'img.youtube.com', 'yt3.ggpht.com']);

export function isAllowedImageUrl(url: string): boolean {
	try {
		const u = new URL(url);
		if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
		return IMAGE_ALLOW_HOSTS.has(u.hostname.toLowerCase());
	} catch {
		return false;
	}
}
