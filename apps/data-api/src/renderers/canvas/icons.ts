/**
 * lucide 아이콘 (0.545, 24×24 viewBox, stroke 기반) — skia용 경로 DB와 드로잉 함수예요. ISC 라이선스.
 * 이모지는 폰트에 없으니 카드에서는 항상 이 벡터 아이콘을 써요.
 * 카드 렌더러는 그려야 할 때마다 ensureKoreanFont()를 먼저 불러 Path2D 싱글턴을 준비해요.
 */
import type { CanvasRenderingContext2D } from 'skia-canvas';
import { getPath2DConstructor } from './fonts.ts';

export type IconName =
	| 'sparkle'
	| 'sparkles'
	| 'calendar'
	| 'users'
	| 'music'
	| 'music-2'
	| 'list-music'
	| 'disc-3'
	| 'trophy'
	| 'history'
	| 'radio'
	| 'pause'
	| 'repeat'
	| 'repeat-1'
	| 'list'
	| 'corner-down-right'
	| 'volume-x'
	| 'volume-1'
	| 'volume-2'
	| 'key'
	| 'gift'
	| 'star'
	| 'crown'
	| 'zodiac-aries'
	| 'zodiac-taurus'
	| 'zodiac-gemini'
	| 'zodiac-cancer'
	| 'zodiac-leo'
	| 'zodiac-virgo'
	| 'zodiac-libra'
	| 'zodiac-scorpio'
	| 'zodiac-sagittarius'
	| 'zodiac-capricorn'
	| 'zodiac-aquarius'
	| 'zodiac-pisces';

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
	radio: {
		subpaths: [
			'M22 12a10 10 0 0 0-10-10 10 10 0 0 0-10 10 10 10 0 0 0 10 10 10 10 0 0 0 10-10',
			'M16 12a4 4 0 0 0-4-4 4 4 0 0 0-4 4 4 4 0 0 0 4 4 4 4 0 0 0 4-4'
		]
	},
	pause: {
		subpaths: ['M15 5v14', 'M9 5v14']
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
	'volume-x': {
		subpaths: ['M11 5 6 9H2v6h4l5 4z', 'M22 9l-6 6', 'M16 9l6 6']
	},
	'volume-1': {
		subpaths: ['M11 5 6 9H2v6h4l5 4z', 'M15.5 8.5a5 5 0 0 1 0 7']
	},
	'volume-2': {
		subpaths: ['M11 5 6 9H2v6h4l5 4z', 'M15.5 8.5a5 5 0 0 1 0 7', 'M19 5a9 9 0 0 1 0 14']
	},
	key: {
		subpaths: ['m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4', 'm21 2-9.6 9.6'],
		circles: [[7.5, 15.5, 5.5]]
	},
	gift: {
		subpaths: ['M12 7v14', 'M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8', 'M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5'],
		rects: [[3, 7, 18, 4, 1]]
	},
	star: {
		subpaths: [
			'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z'
		]
	},
	'zodiac-aries': { subpaths: ['M12 21V9', 'M12 9a4.5 4.5 0 0 0-4.5-4.5A3.5 3.5 0 0 0 4 8', 'M12 9a4.5 4.5 0 0 1 4.5-4.5A3.5 3.5 0 0 1 20 8'] },
	'zodiac-taurus': { subpaths: ['M5 3a7 7 0 0 0 14 0'], circles: [[12, 15, 5]] },
	'zodiac-gemini': { subpaths: ['M5 4c4 2.2 10 2.2 14 0', 'M5 20c4-2.2 10-2.2 14 0', 'M9 3.5v17', 'M15 3.5v17'] },
	'zodiac-cancer': {
		subpaths: ['M4.5 10C4.5 6 8 5 12 5s7 1 9 4', 'M19.5 14c0 4-3.5 5-7.5 5s-7-1-9-4'],
		circles: [
			[7, 10, 2.5],
			[17, 14, 2.5]
		]
	},
	'zodiac-leo': { subpaths: ['M10 16V8a4.5 4.5 0 0 1 9 0c0 4-2 6-2 10a2.5 2.5 0 0 0 4.5 1.5'], circles: [[7, 16, 3]] },
	'zodiac-virgo': { subpaths: ['M3 6c1.5 0 2 1 2 3v10', 'M5 9c0-2 1.5-3 3-3s3 1 3 3v10', 'M11 9c0-2 1.5-3 3-3s3 1 3 3v8c0 3 1.5 5 4 5'] },
	'zodiac-libra': { subpaths: ['M3 17h4.8a5 5 0 1 1 8.4 0H21', 'M3 21h18'] },
	'zodiac-scorpio': {
		subpaths: [
			'M4 5v13',
			'M4 9c0-2 1.5-3.5 3.2-3.5S10.5 7 10.5 9v9',
			'M10.5 9c0-2 1.5-3.5 3.2-3.5S17 7 17 9v9c0 2 1 3 3 3h1',
			'M19 18.5l2.5 2.5-2.5 2.5'
		]
	},
	'zodiac-sagittarius': { subpaths: ['M4 20L20 4', 'M10 4h10v10', 'M6 12l6 6'] },
	'zodiac-capricorn': { subpaths: ['M3 5c2.5 0 3.5 2 4 4v8', 'M7 9c0-2 2-4 4-4s3.5 2 3.5 4v8', 'M14.5 17c0-2.5 2-4.5 4-4.5a3 3 0 0 1 0 6'] },
	'zodiac-aquarius': { subpaths: ['M3 9c2-2.5 3.5-2.5 5.5 0s3.5 2.5 5.5 0 3.5-2.5 6 0', 'M3 16c2-2.5 3.5-2.5 5.5 0s3.5 2.5 5.5 0 3.5-2.5 6 0'] },
	'zodiac-pisces': { subpaths: ['M6 3a14 14 0 0 1 0 18', 'M18 3a14 14 0 0 0 0 18', 'M4 12h16'] },
	crown: {
		subpaths: [
			'M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z',
			'M5 21h14'
		]
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
	const def = ICONS[name];
	const pathCtor = getPath2DConstructor();
	// Path2D는 ensureKoreanFont()가 세운 싱글턴이에요 — 아직 준비 전이면 아이콘만 건너뛰어요(도달 불가 경로).
	if (!def || !pathCtor) return;
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
		for (const d of def.subpaths ?? []) ctx.fill(new pathCtor(d) as never);
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
		for (const d of def.subpaths ?? []) ctx.stroke(new pathCtor(d) as never);
		if (def.circles)
			for (const [cx, cy, r] of def.circles) {
				ctx.beginPath();
				ctx.arc(cx, cy, r, 0, Math.PI * 2);
				ctx.stroke();
			}
	}
	ctx.restore();
}
