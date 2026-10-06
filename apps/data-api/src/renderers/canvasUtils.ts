/**
 * skia-canvas 공용 헬퍼 — profileCard / nowPlayingCard에서 함께 써요.
 */
import type { CanvasDrawable, CanvasRenderingContext2D } from 'skia-canvas';

/** 한글 폰트 1회 등록 (data-api Dockerfile에 resources/fonts 포함). */
export async function ensureKoreanFont(): Promise<void> {
	const { FontLibrary } = await import('skia-canvas');
	try {
		if (!FontLibrary.has('Noto Sans KR')) {
			const { join } = await import('node:path');
			const fontPath = join(process.cwd(), 'resources/fonts/NotoSansKR.ttf');
			FontLibrary.use('Noto Sans KR', [fontPath]);
		}
	} catch (error) {
		console.error(`[data-api] font load failed: ${error instanceof Error ? error.message : String(error)}`);
	}
}

/** URL 이미지를 CanvasDrawable로. 실패 시 null (호출자가 폴백 그려요). */
export async function loadImage(url: string): Promise<CanvasDrawable | null> {
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

/** 텍스트 생략 (말줄임). */
export function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
	if (ctx.measureText(text).width <= maxWidth) return text;
	let s = text;
	while (s.length > 1 && ctx.measureText(s + '…').width > maxWidth) s = s.slice(0, -1);
	return s + '…';
}

/** FNV-1a 해시 — 시드/색상 고정에 써요. */
export function hashString(s: string): number {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
	return h >>> 0;
}

/** ms → "m:ss" / "h:mm:ss". */
export function formatClock(ms: number): string {
	const totalSec = Math.max(0, Math.floor(ms / 1000));
	const h = Math.floor(totalSec / 3600);
	const m = Math.floor((totalSec % 3600) / 60);
	const s = totalSec % 60;
	if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	return `${m}:${String(s).padStart(2, '0')}`;
}

export function hexToRgba(hex: string, alpha: number): string {
	const n = parseInt(hex.slice(1), 16);
	return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
