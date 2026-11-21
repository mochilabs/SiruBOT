/**
 * satori 렌더 공용 키트(node 전용) — 폰트 로딩, SVG→PNG 변환, 원격 이미지 data URI 변환, 아이콘 요소를 한곳에서 해요.
 * 런타임 독립 부분(요소 헬퍼 `h`·`img`, `stripEmoji`, `createAsyncLru`, 토큰)은 `@sirubot/cards`에 있어요. skia-canvas 렌더러(renderers/*.ts)와는 독립이에요.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Resvg as ResvgType } from '@resvg/resvg-js';
import type { Font } from 'satori';
import satori from 'satori';
import { CARD_FONT, type SatoriElement } from '@sirubot/cards';
import { getLogger } from '../../utils/logger.ts';
import { getIconDef, type IconName } from '../canvas/icons.ts';
import { isAllowedImageUrl } from '../canvas/images.ts';

const logger = getLogger('satoriKit');

let fontsPromise: Promise<Font[]> | null = null;

/**
 * Pretendard JP를 굵기별로 1회 읽어 캐시해요. satori는 가변 폰트의 굵기 축을 쓰지 못해서
 * 400은 가변 원본(13MB), 600·900은 거기서 뽑은 정적 서브셋(resources/fonts/README.md)을 써요.
 * 서브셋이 없으면 400으로 폴백해서 굵기만 못 살리고 그려져요.
 */
export function loadCardFonts(): Promise<Font[]> {
	fontsPromise ??= (async () => {
		// 런타임 CWD는 프로덕션(/app)·dev(apps/data-api)로 달라요 — canvas/fonts.ts와 같은 후보를 탐색해요.
		const dirs = [join(process.cwd(), 'resources/fonts'), join(process.cwd(), '../../resources/fonts')];
		const find = (fileName: string): string | null => {
			for (const dir of dirs) {
				const path = join(dir, fileName);
				if (existsSync(path)) return path;
			}
			return null;
		};
		const regularPath = find('PretendardJPVariable.ttf');
		if (!regularPath) {
			logger.warn('PretendardJPVariable.ttf를 찾지 못했어요. satori 카드를 그릴 수 없어요.');
			return [];
		}
		const fonts: Font[] = [{ name: CARD_FONT, data: await readFile(regularPath), weight: 400, style: 'normal' }];
		for (const [fileName, weight] of [
			['PretendardJP-SemiBold.subset.ttf', 600],
			['PretendardJP-Black.subset.ttf', 900]
		] as const) {
			const path = find(fileName);
			if (path) fonts.push({ name: CARD_FONT, data: await readFile(path), weight, style: 'normal' });
			else logger.warn(`${fileName}를 찾지 못했어요. 해당 굵기는 400으로 그려져요.`);
		}
		return fonts;
	})();
	return fontsPromise;
}

/** 투명한 1x1 SVG — 이모지 자리를 비워 두는 용도예요. */
const EMPTY_EMOJI = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>').toString('base64')}`;

type SatoriInput = Parameters<typeof satori>[0];

let resvgPromise: Promise<typeof import('@resvg/resvg-js')> | null = null;

/** resvg-js 모듈 — 네이티브 바이너리라 처음 쓸 때 한 번만 로드해요. */
export function loadResvgModule(): Promise<typeof import('@resvg/resvg-js')> {
	resvgPromise ??= import('@resvg/resvg-js');
	return resvgPromise;
}

/** resvg 생성자(동기 API) — 크기가 아주 작은 SVG나 테스트용이에요. 카드 렌더에는 renderSvgAsync를 써요. */
export async function loadResvg(): Promise<typeof ResvgType> {
	return (await loadResvgModule()).Resvg as unknown as typeof ResvgType;
}

/**
 * SVG를 libuv 스레드풀에서 래스터해요. resvg-js의 동기 `render()`는 메인 스레드를 막아서 렌더가 몰리면 같은 프로세스의
 * 다른 요청(Redis 허브·SSE)까지 지연돼요 — 카드 렌더는 항상 이 함수를 써요.
 */
export async function renderSvgAsync(svg: string, options: { fitTo?: { mode: 'width'; value: number } } = {}) {
	const { renderAsync } = await loadResvgModule();
	// satori가 글자를 path로 바꿔 줘서 폰트가 필요 없어요 — system font 스캔(첫 호출 1초 넘게)을 꺼요.
	return renderAsync(svg, { ...options, font: { loadSystemFonts: false } });
}

/**
 * satori로 SVG를 만들고 resvg로 PNG까지 변환해요. 폰트를 못 찾으면 throw해서 라우트가 500으로 알려요.
 * height를 생략하면 레이아웃이 정한 높이로 그려요 (대기열 길이처럼 내용에 따라 달라지는 카드용).
 * outputWidth를 주면 레이아웃 크기(width)는 그대로 두고 출력 PNG만 그 너비로 균일 축소/확대해요 (인사 카드 1200→800).
 */
export async function renderSatoriPng(node: SatoriElement, size: { width: number; height?: number; outputWidth?: number }): Promise<Buffer> {
	const { outputWidth, ...layoutSize } = size;
	const fonts = await loadCardFonts();
	if (fonts.length === 0) throw new Error('card font unavailable');
	const svg = await satori(
		node as unknown as SatoriInput,
		{
			...layoutSize,
			fonts,
			// 색 이모지는 아직 지원하지 않아요 — 깨진 글리프(tofu) 대신 빈칸으로 두고, 폰트에 없는 글자는 건너뛰어요.
			// 600·900 서브셋엔 한자가 없어서, 폰트에 없는 글자(한자 등)는 한자를 담은 400 가변 원본으로 그려요.
			loadAdditionalAsset: async (code) =>
				code === 'emoji' ? EMPTY_EMOJI : fonts.slice(0, 1).map((font) => ({ ...font, name: `${CARD_FONT}-fallback-${code}` }))
		} as Parameters<typeof satori>[1]
	);
	const rendered = await renderSvgAsync(svg, { fitTo: { mode: 'width', value: outputWidth ?? size.width } });
	return Buffer.from(rendered.asPng());
}

/** lucide 아이콘을 satori `<svg>` 요소로 — skia 카드와 같은 경로 DB(canvas/icons.ts)를 써요. 선 아이콘만 지원해요. */
export function iconElement(name: IconName, size: number, color: string, strokeWidth = 2): SatoriElement {
	const def = getIconDef(name);
	const children: SatoriElement[] = [
		...(def?.subpaths ?? []).map((d) => ({ type: 'path', props: { d } })),
		...(def?.circles ?? []).map(([cx, cy, r]) => ({ type: 'circle', props: { cx, cy, r } })),
		...(def?.rects ?? []).map(([x, y, width, height, rx]) => ({ type: 'rect', props: { x, y, width, height, rx } }))
	];
	return {
		type: 'svg',
		props: {
			width: size,
			height: size,
			viewBox: '0 0 24 24',
			fill: 'none',
			stroke: color,
			strokeWidth,
			strokeLinecap: 'round',
			strokeLinejoin: 'round',
			children
		}
	} as unknown as SatoriElement;
}

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif']);
/** 썸네일·아바타는 수백 KB 안쪽이에요 — 이보다 크면 받지 않아요. */
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** 허용 도메인의 이미지를 data URI로 받아요. 실패하거나 webp 같은 미지원 형식이면 null이라 호출부가 폴백을 그려요. */
export async function fetchImageDataUri(url: string | null | undefined): Promise<string | null> {
	if (!url || !isAllowedImageUrl(url)) return null;
	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
		if (!res.ok) return null;
		const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
		if (!IMAGE_TYPES.has(type)) return null;
		const buf = Buffer.from(await res.arrayBuffer());
		if (buf.length > MAX_IMAGE_BYTES) return null;
		return `data:${type};base64,${buf.toString('base64')}`;
	} catch {
		return null;
	}
}
