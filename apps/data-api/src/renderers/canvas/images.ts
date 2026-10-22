/**
 * 카드용 원격 이미지 로딩 — 도메인 allowlist로 SSRF를 막아요 (보안 경계).
 */
import type { CanvasDrawable } from 'skia-canvas';

/** 이미지 fetch 허용 호스트 — Discord CDN + 유튜브 썸네일만. */
const IMAGE_ALLOW_HOSTS = new Set(['cdn.discordapp.com', 'media.discordapp.net', 'i.ytimg.com', 'img.youtube.com', 'yt3.ggpht.com']);

/** URL 이미지를 CanvasDrawable로. 실패 시 null (호출자가 폴백 그려요). */
async function loadImage(url: string): Promise<CanvasDrawable | null> {
	try {
		const { loadImage } = await import('skia-canvas');
		const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
		if (!res.ok) return null;
		const buf = Buffer.from(await res.arrayBuffer());
		return (await loadImage(buf)) as unknown as CanvasDrawable;
	} catch {
		return null;
	}
}

/** URL 이미지를 CanvasDrawable로 — 허용 도메인만 (SSRF 방지). 실패 시 null (호출자가 폴백 그려요). */
export async function loadImageAllowed(url: string): Promise<CanvasDrawable | null> {
	if (!isAllowedImageUrl(url)) return null;
	return loadImage(url);
}

export function isAllowedImageUrl(url: string): boolean {
	try {
		const u = new URL(url);
		if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
		return IMAGE_ALLOW_HOSTS.has(u.hostname.toLowerCase());
	} catch {
		return false;
	}
}
