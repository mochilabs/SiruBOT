/**
 * Takumi 카드 렌더 공용 키트(node 전용) — 폰트 등록, PNG/RGBA 래스터, 원격 이미지 data URI 변환, 아이콘 요소를 한곳에서 해요.
 * 런타임 독립 부분(요소 헬퍼 `h`·`img`, `stripEmoji`, `createAsyncLru`, 토큰)은 `@sirubot/cards`에 있어요.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Renderer } from '@takumi-rs/core';
import { fromJsx } from '@takumi-rs/helpers/jsx';
import { CARD_FONT, h, img, type SatoriElement } from '@sirubot/cards';
import { getLogger } from '../../utils/logger.ts';
import { getIconDef, type IconName } from '../canvas/icons.ts';
import { isAllowedImageUrl } from '../canvas/images.ts';

const logger = getLogger('satoriKit');

let rendererPromise: Promise<{ renderer: Renderer; hasFont: boolean }> | null = null;

function findFontFile(fileName: string): string | null {
	// 런타임 CWD는 프로덕션(/app)·dev(apps/data-api)로 달라요 — canvas/fonts.ts와 같은 후보를 탐색해요.
	const dirs = [join(process.cwd(), 'resources/fonts'), join(process.cwd(), '../../resources/fonts')];
	for (const dir of dirs) {
		const path = join(dir, fileName);
		if (existsSync(path)) return path;
	}
	return null;
}

/**
 * Takumi Renderer 싱글턴 — PretendardJP 가변 폰트(100~900 굵기 + 한글·일본어·한자)와 TwemojiMozilla 컬러 이모지 폰트를 1회 등록해요.
 */
export function getCardRenderer(): Promise<{ renderer: Renderer; hasFont: boolean }> {
	rendererPromise ??= (async () => {
		const renderer = new Renderer();
		let hasFont = false;
		const varPath = findFontFile('PretendardJPVariable.ttf');
		if (varPath) {
			await renderer.registerFont({ name: CARD_FONT, data: await readFile(varPath) });
			hasFont = true;
		} else {
			logger.warn('PretendardJPVariable.ttf를 찾지 못했어요. 카드를 그릴 수 없어요.');
		}
		const emojiPath = findFontFile('TwemojiMozilla.ttf');
		if (emojiPath) {
			await renderer.registerFont({ name: 'Twemoji', data: await readFile(emojiPath), generic: 'emoji' });
		} else {
			logger.warn('TwemojiMozilla.ttf를 찾지 못했어요. 컬러 이모지가 표시되지 않을 수 있어요.');
		}
		return { renderer, hasFont };
	})();
	return rendererPromise;
}

/** SVG 문자열을 Takumi로 래스터해 PNG 또는 raw RGBA 버퍼로 돌려줘요 (아트워크 크롭·블러·테스트용). */
export async function renderSvgRaster(svg: string, width: number, height: number, format: 'png' | 'raw'): Promise<Buffer> {
	const { renderer } = await getCardRenderer();
	const uri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
	const { node } = await fromJsx(img(uri, { width, height }));
	return Buffer.from(await renderer.render(node, { width, height, format }));
}

/**
 * Takumi로 카드 노드를 PNG 버퍼로 그려요. 폰트를 못 찾으면 throw해서 라우트가 500으로 알려요.
 * height를 생략하면 레이아웃이 정한 높이로 그려요 (대기열 길이처럼 내용에 따라 달라지는 카드용).
 * outputWidth를 주면 레이아웃 크기(width)는 그대로 두고 출력 PNG만 그 너비로 균일 축소/확대해요 (인사 카드 1200→800).
 */
export async function renderSatoriPng(node: SatoriElement, size: { width: number; height?: number; outputWidth?: number }): Promise<Buffer> {
	const { renderer, hasFont } = await getCardRenderer();
	if (!hasFont) throw new Error('card font unavailable');

	let targetNode = node;
	let renderWidth = size.width;
	let renderHeight = size.height;

	if (size.outputWidth && size.outputWidth !== size.width) {
		const scale = size.outputWidth / size.width;
		renderWidth = size.outputWidth;
		renderHeight = size.height ? Math.round(size.height * scale) : undefined;
		targetNode = h(
			'div',
			{
				width: renderWidth,
				...(renderHeight ? { height: renderHeight } : {}),
				overflow: 'hidden'
			},
			h(
				'div',
				{
					width: size.width,
					...(size.height ? { height: size.height } : {}),
					transform: `scale(${scale})`,
					transformOrigin: 'top left'
				},
				node
			)
		);
	}

	const { node: takumiNode } = await fromJsx(targetNode as unknown as Parameters<typeof fromJsx>[0]);
	return Buffer.from(
		await renderer.render(takumiNode, {
			width: renderWidth,
			...(renderHeight ? { height: renderHeight } : {}),
			format: 'png'
		})
	);
}

/** lucide 아이콘을 `<svg>` 요소로 — skia 카드와 같은 경로 DB(canvas/icons.ts)를 써요. 선 아이콘만 지원해요. */
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

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
/** 썸네일·아바타는 수백 KB 안쪽이에요 — 이보다 크면 받지 않아요. */
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** 허용 도메인의 이미지를 data URI로 받아요. 실패하거나 미지원 형식이면 null이라 호출부가 폴백을 그려요. */
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
