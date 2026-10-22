/**
 * 카드 도형·텍스트 유틸 — 측정/생략, 시드 난수, 색 보간, 원형 이미지 클립.
 */
import type { CanvasDrawable, CanvasRenderingContext2D } from 'skia-canvas';

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

/** 시드 고정 LCG — 재현 가능한 장식용 난수. hashString으로 시드를 만들어 써요. */
export function makeRng(seed: number): () => number {
	let s = seed || 1;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 4294967296;
	};
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

/** hex→rgba 문자열은 공용 계약(@sirubot/utils/greetingCardDesign) 단일 소스를 재수출해요 — 인사 카드와 같은 rgba 문자열을 써요 */
export { hexToRgba } from '@sirubot/utils/greetingCardDesign';

/** 원형 클립 안에 이미지를 cover-fit으로 그려요 (아바타 등) */
export function drawCircleImage(ctx: CanvasRenderingContext2D, img: CanvasDrawable, cx: number, cy: number, radius: number): void {
	ctx.save();
	ctx.beginPath();
	ctx.arc(cx, cy, radius, 0, Math.PI * 2);
	ctx.clip();
	const iw = (img as { width: number }).width;
	const ih = (img as { height: number }).height;
	const scale = Math.max((radius * 2) / iw, (radius * 2) / ih);
	ctx.drawImage(img, cx - (iw * scale) / 2, cy - (ih * scale) / 2, iw * scale, ih * scale);
	ctx.restore();
}
