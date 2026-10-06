/**
 * skia-canvas 공용 헬퍼 — profileCard / nowPlayingCard에서 함께 써요.
 */
import type { CanvasDrawable, CanvasRenderingContext2D } from 'skia-canvas';

/** 한글 폰트 1회 등록 (data-api Dockerfile에 resources/fonts 포함). + lucide Path2D 워밍업. */
export async function ensureKoreanFont(): Promise<void> {
	const { FontLibrary, Path2D } = await import('skia-canvas');
	pathCtorRef = Path2D as unknown as new (d: string) => unknown;
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

/** skia Path2D 생성자 싱글턴 — ensureKoreanFont()에서 세팅돼요. */
let pathCtorRef: (new (d: string) => unknown) | null = null;

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

/**
 * lucide 아이콘 (0.545, 24×24 viewBox, stroke 기반) — skia용으로 필요한 것만 내장해요. ISC 라이선스.
 * 이모지는 폰트에 없으니 카드에서는 항상 이 벡터 아이콘을 써요.
 */
export type IconName =
	| 'sparkle'
	| 'sparkles'
	| 'calendar'
	| 'calendar-days'
	| 'users'
	| 'music'
	| 'music-2'
	| 'list-music'
	| 'disc-3'
	| 'trophy'
	| 'history'
	| 'cake'
	| 'moon-star'
	| 'radio'
	| 'skip-back'
	| 'skip-forward'
	| 'play'
	| 'pause'
	| 'square'
	| 'arrow-right'
	| 'repeat'
	| 'repeat-1'
	| 'list'
	| 'corner-down-right'
	| 'trash-2'
	| 'list-plus'
	| 'rotate-ccw'
	| 'chevrons-left'
	| 'chevron-left'
	| 'chevron-right'
	| 'chevrons-right'
	| 'shuffle'
	| 'volume-x'
	| 'volume-1'
	| 'volume-2'
	| 'star'
	| 'plus'
	| 'x'
	| 'bell'
	| 'clock-4'
	| 'arrow-left';

interface IconDef {
	subpaths?: string[];
	circles?: [number, number, number][];
	rects?: [number, number, number, number, number][];
}

const ICONS: Record<IconName, IconDef> = {
	sparkle: {
		subpaths: [
			'M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z'
		]
	},
	sparkles: {
		subpaths: [
			'M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z',
			'M20 2v4',
			'M22 4h-4'
		]
	},
	calendar: {
		subpaths: ['M8 2v4', 'M16 2v4', 'M3 10h18'],
		rects: [[3, 4, 18, 18, 2]]
	},
	'calendar-days': {
		subpaths: ['M8 2v4', 'M16 2v4', 'M3 10h18', 'M8 14h.01', 'M12 14h.01', 'M16 14h.01', 'M8 18h.01', 'M12 18h.01', 'M16 18h.01'],
		rects: [[3, 4, 18, 18, 2]]
	},
	users: {
		subpaths: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M16 3.128a4 4 0 0 1 0 7.744', 'M22 21v-2a4 4 0 0 0-3-3.87'],
		circles: [[9, 7, 4]]
	},
	music: {
		subpaths: ['M9 18V5l12-2v13'],
		circles: [
			[6, 18, 3],
			[18, 16, 3]
		]
	},
	'music-2': {
		subpaths: ['M12 18V2l7 4'],
		circles: [[8, 18, 4]]
	},
	'list-music': {
		subpaths: ['M16 5H3', 'M11 12H3', 'M11 19H3', 'M21 16V5'],
		circles: [[18, 16, 3]]
	},
	'disc-3': {
		subpaths: ['M6 12c0-1.7.7-3.2 1.8-4.2', 'M18 12c0 1.7-.7 3.2-1.8 4.2'],
		circles: [
			[12, 12, 10],
			[12, 12, 2]
		]
	},
	trophy: {
		subpaths: [
			'M10 14.66v1.626a2 2 0 0 1-.976 1.696A5 5 0 0 0 7 21.978',
			'M14 14.66v1.626a2 2 0 0 0 .976 1.696A5 5 0 0 1 17 21.978',
			'M18 9h1.5a1 1 0 0 0 0-5H18',
			'M4 22h16',
			'M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z',
			'M6 9H4.5a1 1 0 0 1 0-5H6'
		]
	},
	history: {
		subpaths: ['M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5', 'M12 7v5l4 2']
	},
	cake: {
		subpaths: [
			'M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8',
			'M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1',
			'M2 21h20',
			'M7 8v3',
			'M12 8v3',
			'M17 8v3',
			'M7 4h.01',
			'M12 4h.01',
			'M17 4h.01'
		]
	},
	'moon-star': {
		subpaths: [
			'M18 5h4',
			'M20 3v4',
			'M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401'
		]
	},
	radio: {
		subpaths: [
			'M22 12a10 10 0 0 0-10-10 10 10 0 0 0-10 10 10 10 0 0 0 10 10 10 10 0 0 0 10-10',
			'M16 12a4 4 0 0 0-4-4 4 4 0 0 0-4 4 4 4 0 0 0 4 4 4 4 0 0 0 4-4'
		]
	},
	'skip-back': {
		subpaths: ['M19 20 9 12l10-8z', 'M5 19V5']
	},
	'skip-forward': {
		subpaths: ['M5 4l10 8-10 8z', 'M19 5v14']
	},
	play: {
		subpaths: ['M6 3 20 12 6 21z']
	},
	pause: {
		subpaths: ['M15 5v14', 'M9 5v14']
	},
	square: {
		subpaths: ['M5 5h14v14H5z']
	},
	'arrow-right': {
		subpaths: ['M5 12h14', 'M13 6l6 6-6 6']
	},
	'arrow-left': {
		subpaths: ['M19 12H5', 'M11 18 5 12l6-6']
	},
	repeat: {
		subpaths: ['M17 2l4 4-4 4', 'M3 11v-1a4 4 0 0 1 4-4h14', 'M7 22l-4-4 4-4', 'M21 13v1a4 4 0 0 1-4 4H3']
	},
	'repeat-1': {
		subpaths: ['M17 2l4 4-4 4', 'M3 11v-1a4 4 0 0 1 4-4h14', 'M7 22l-4-4 4-4', 'M21 13v1a4 4 0 0 1-4 4H3', 'M11 10h1v4']
	},
	list: {
		subpaths: ['M3 12h.01', 'M3 18h.01', 'M3 6h.01', 'M8 12h13', 'M8 18h13', 'M8 6h13']
	},
	'corner-down-right': {
		subpaths: ['M4 4v7a4 4 0 0 0 4 4h12', 'M15 10l5 5-5 5']
	},
	'trash-2': {
		subpaths: ['M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2', 'M10 11v6', 'M14 11v6']
	},
	'list-plus': {
		subpaths: ['M3 5h.01', 'M8 5h13', 'M3 12h.01', 'M8 12h13', 'M3 19h.01', 'M8 19h13', 'M19 16v6', 'M16 19h6']
	},
	'rotate-ccw': {
		subpaths: ['M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5']
	},
	'chevrons-left': {
		subpaths: ['M11 17l-5-5 5-5', 'M18 17l-5-5 5-5']
	},
	'chevron-left': {
		subpaths: ['M15 18l-6-6 6-6']
	},
	'chevron-right': {
		subpaths: ['M9 18l6-6-6-6']
	},
	'chevrons-right': {
		subpaths: ['M6 17l5-5-5-5', 'M13 17l5-5-5-5']
	},
	shuffle: {
		subpaths: [
			'M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.8-1.1 2-1.7 3.3-1.7H22',
			'M18 2l4 4-4 4',
			'M2 6h1.9c1.5 0 2.9.9 3.7 2.2',
			'M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8',
			'M18 14l4 4-4 4'
		]
	},
	'volume-x': {
		subpaths: ['M11 5 6 9H2v6h4l5 4z', 'M22 9l-6 6', 'M16 9l6 6']
	},
	'volume-1': {
		subpaths: ['M11 5 6 9H2v6h4l5 4z', 'M15.5 8.5a5 5 0 0 1 0 7']
	},
	'volume-2': {
		subpaths: ['M11 5 6 9H2v6h4l5 4z', 'M15.5 8.5a5 5 0 0 1 0 7', 'M19 5a9 9 0 0 1 0 14']
	},
	star: {
		subpaths: [
			'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.907l-3.797 3.696a2.123 2.123 0 0 0-.611 1.878l.894 5.195a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.08 21.33a.53.53 0 0 1-.77-.56l.894-5.195a2.122 2.122 0 0 0-.611-1.878L1.996 9.796a.53.53 0 0 1 .294-.906l5.166-.756a2.123 2.123 0 0 0 1.597-1.16z'
		]
	},
	plus: {
		subpaths: ['M5 12h14', 'M12 5v14']
	},
	x: {
		subpaths: ['M18 6 6 18', 'M6 6l12 12']
	},
	bell: {
		subpaths: [
			'M10.268 21a2 2 0 0 0 3.464 0',
			'M22 8c0-2.3-.8-4.3-2-6',
			'M2 8c0-2.3.8-4.3 2-6',
			'M9 3h6',
			'M22 17H2c3 0 4-2 4-5V9a6 6 0 0 1 12 0v3c0 3 1 5 4 5z'
		]
	},
	'clock-4': {
		subpaths: ['M12 6v6l4 2'],
		circles: [[12, 12, 10]]
	}
};

/** 아이콘 그리기 — (x, y)는 아이콘 박스 좌상단, size는 박스 한변. fill:true면 채운 모양. */
export function drawIcon(
	ctx: CanvasRenderingContext2D,
	name: IconName,
	x: number,
	y: number,
	size: number,
	color: string,
	options: { fill?: boolean; strokeWidth?: number } = {}
): void {
	drawIconInner(ctx, name, x, y, size, color, options, pathCtorRef);
}

function drawIconInner(
	ctx: CanvasRenderingContext2D,
	name: IconName,
	x: number,
	y: number,
	size: number,
	color: string,
	options: { fill?: boolean; strokeWidth?: number },
	pathCtor: (new (d: string) => unknown) | null
): void {
	const def = ICONS[name];
	if (!def) return;
	const s = size / 24;
	ctx.save();
	ctx.translate(x, y);
	ctx.scale(s, s);
	if (def.rects)
		for (const [rx, ry, rw, rh, rr] of def.rects) {
			ctx.beginPath();
			ctx.roundRect(rx, ry, rw, rh, rr);
			options.fill
				? ((ctx.fillStyle = color), ctx.fill())
				: ((ctx.strokeStyle = color), (ctx.lineWidth = options.strokeWidth ?? 2), ctx.stroke());
		}
	if (options.fill) {
		ctx.fillStyle = color;
		for (const d of def.subpaths ?? []) {
			if (pathCtor) ctx.fill(new pathCtor(d) as never);
			else fillPathData(ctx, d);
		}
		if (def.circles)
			for (const [cx, cy, r] of def.circles) {
				ctx.beginPath();
				ctx.arc(cx, cy, r, 0, Math.PI * 2);
				ctx.fill();
			}
	} else {
		ctx.strokeStyle = color;
		ctx.lineWidth = options.strokeWidth ?? 2;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		for (const d of def.subpaths ?? []) {
			if (pathCtor) ctx.stroke(new pathCtor(d) as never);
			else strokePathData(ctx, d);
		}
		if (def.circles)
			for (const [cx, cy, r] of def.circles) {
				ctx.beginPath();
				ctx.arc(cx, cy, r, 0, Math.PI * 2);
				ctx.stroke();
			}
	}
	ctx.restore();
}

/** Path2D 없이 path d 문자열을 파싱해 ctx에 직접 그려요 (lucide d는 M/L/Q/C/Z/H/V + 암묵 반복 명령). */
function applyPathData(ctx: CanvasRenderingContext2D, d: string, target: 'fill' | 'stroke'): void {
	ctx.beginPath();
	let i = 0;
	let px = 0,
		py = 0;
	let cmd = '';
	const isNumStart = (c: string) => /[\d.+-]/.test(c);
	const num = () => {
		while (i < d.length && /[\s,]/.test(d[i])) i++;
		let s = i;
		while (i < d.length && !/[\s,]/.test(d[i]) && !/[A-Za-z]/.test(d[i])) i++;
		return parseFloat(d.slice(s, i));
	};
	while (i < d.length) {
		const c = d[i];
		if (/[A-Za-z]/.test(c)) {
			cmd = c;
			i++;
		} else if (!isNumStart(c)) {
			i++;
			continue;
		}
		const U = cmd.toUpperCase();
		const rel = cmd === U.toLowerCase();
		switch (U) {
			case 'M': {
				const x = num();
				const y = num();
				px = rel ? px + x : x;
				py = rel ? py + y : y;
				ctx.moveTo(px, py);
				// 이후 좌표쌍은 L로 이어요
				cmd = rel ? 'l' : 'L';
				break;
			}
			case 'L': {
				const x = num();
				const y = num();
				px = rel ? px + x : x;
				py = rel ? py + y : y;
				ctx.lineTo(px, py);
				break;
			}
			case 'H': {
				const x = num();
				px = rel ? px + x : x;
				ctx.lineTo(px, py);
				break;
			}
			case 'V': {
				const y = num();
				py = rel ? py + y : y;
				ctx.lineTo(px, py);
				break;
			}
			case 'Q': {
				const cx = num();
				const cy = num();
				const x = num();
				const y = num();
				ctx.quadraticCurveTo(rel ? px + cx : cx, rel ? py + cy : cy, rel ? px + x : x, rel ? py + y : y);
				px = rel ? px + x : x;
				py = rel ? py + y : y;
				break;
			}
			case 'C': {
				const c1x = num();
				const c1y = num();
				const c2x = num();
				const c2y = num();
				const x = num();
				const y = num();
				ctx.bezierCurveTo(
					rel ? px + c1x : c1x,
					rel ? py + c1y : c1y,
					rel ? px + c2x : c2x,
					rel ? py + c2y : c2y,
					rel ? px + x : x,
					rel ? py + y : y
				);
				px = rel ? px + x : x;
				py = rel ? py + y : y;
				break;
			}
			// 원호 — SVG arc → canvas arc 변환 (각도 파라미터화)
			case 'A': {
				const rx = num();
				const ry = num();
				const rot = num();
				const largeArc = num();
				const sweep = num();
				const x = num();
				const y = num();
				if (rx === 0 || ry === 0) break;
				const x2 = rel ? px + x : x;
				const y2 = rel ? py + y : y;
				const phi = (rot * Math.PI) / 180;
				const sinPhi = Math.sin(phi);
				const cosPhi = Math.cos(phi);
				const dx = (px - x2) / 2;
				const dy = (py - y2) / 2;
				const x1p = cosPhi * dx + sinPhi * dy;
				const y1p = -sinPhi * dx + cosPhi * dy;
				const rx2 = rx * rx;
				const ry2 = ry * ry;
				let factor = Math.sqrt(Math.max(0, (rx2 * ry2 - rx2 * y1p * y1p - ry2 * x1p * x1p) / (rx2 * y1p * y1p + ry2 * x1p * x1p)));
				if (largeArc === sweep) factor = -factor;
				const cxp = (factor * rx * y1p) / ry;
				const cyp = (-factor * ry * x1p) / rx;
				const cx = cosPhi * cxp - sinPhi * cyp + (px + x2) / 2;
				const cy = sinPhi * cxp + cosPhi * cyp + (py + y2) / 2;
				const start = Math.atan2((y1p - cyp) / ry, (x1p - cxp) / rx);
				let end = Math.atan2((-y1p - cyp) / ry, (-x1p - cxp) / rx);
				if (!sweep && end > start) end -= Math.PI * 2;
				if (sweep && end < start) end += Math.PI * 2;
				// 회전 보정 — translate/rotate로 그려요
				ctx.save();
				ctx.translate(cx, cy);
				ctx.rotate(phi);
				ctx.arc(0, 0, rx, start - phi, end - phi, !sweep);
				ctx.restore();
				px = x2;
				py = y2;
				break;
			}
			case 'Z': {
				ctx.closePath();
				cmd = '';
				break;
			}
			default:
				cmd = '';
		}
	}
	if (target === 'fill') ctx.fill();
	else ctx.stroke();
}

function fillPathData(ctx: CanvasRenderingContext2D, d: string): void {
	applyPathData(ctx, d, 'fill');
}

function strokePathData(ctx: CanvasRenderingContext2D, d: string): void {
	applyPathData(ctx, d, 'stroke');
}

export function hexToRgba(hex: string, alpha: number): string {
	const n = parseInt(hex.slice(1), 16);
	return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
