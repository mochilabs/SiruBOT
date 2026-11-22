/**
 * Takumi 카드 렌더 공용 키트(node 전용) — 폰트 등록, PNG/RGBA 래스터, 원격 이미지 data URI 변환, `Box`·`Icon` 컴포넌트를 한곳에서 해요.
 * 카드는 TSX로 짜요. 런타임 독립 부분(`stripEmoji`, `createAsyncLru`, 토큰)은 `@sirubot/cards`에 있어요.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Renderer } from '@takumi-rs/core';
import { fromJsx } from '@takumi-rs/helpers/jsx';
import type { CSSProperties, ReactNode } from 'react';
import { CARD_FONT } from '@sirubot/cards';
import { getLogger } from '../../utils/logger.ts';
import { getIconDef, type IconName } from './icons.ts';
import { isAllowedImageUrl } from './images.ts';

const logger = getLogger('takumiKit');

let rendererPromise: Promise<{ renderer: Renderer; hasFont: boolean }> | null = null;

function findFontFile(fileName: string): string | null {
	// 런타임 CWD는 프로덕션(/app)·dev(apps/data-api)로 달라요 — resources/fonts 후보를 탐색해요.
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

/** `display: flex` div — Takumi의 div는 기본이 block이라 flex 레이아웃은 이 컴포넌트로 만들어요. */
export function Box({ style, children }: { style?: CSSProperties; children?: ReactNode }): ReactNode {
	return <div style={{ display: 'flex', ...style }}>{children}</div>;
}

/** lucide 아이콘을 `<svg>`로 — 경로 DB(icons.ts)를 써요. */
export function Icon({
	name,
	size,
	color,
	strokeWidth = 2,
	filled = false
}: {
	name: IconName;
	size: number;
	color: string;
	strokeWidth?: number;
	/** true면 경로 안쪽도 같은 색으로 채워요 (별·왕관) */
	filled?: boolean;
}): ReactNode {
	const def = getIconDef(name);
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill={filled ? color : 'none'}
			stroke={color}
			strokeWidth={strokeWidth}
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			{(def?.subpaths ?? []).map((d, i) => (
				<path key={`p${i}`} d={d} />
			))}
			{(def?.circles ?? []).map(([cx, cy, r], i) => (
				<circle key={`c${i}`} cx={cx} cy={cy} r={r} />
			))}
			{(def?.rects ?? []).map(([x, y, width, height, rx], i) => (
				<rect key={`r${i}`} x={x} y={y} width={width} height={height} rx={rx} />
			))}
		</svg>
	);
}

/** SVG 문자열을 Takumi로 래스터해 PNG 또는 raw RGBA 버퍼로 돌려줘요 (아트워크 크롭·블러·테스트용). */
export async function renderSvgRaster(svg: string, width: number, height: number, format: 'png' | 'raw'): Promise<Buffer> {
	const { renderer } = await getCardRenderer();
	const uri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
	const { node } = await fromJsx(<img src={uri} style={{ width, height }} />);
	return Buffer.from(await renderer.render(node, { width, height, format }));
}

/**
 * 움직이는 GIF data URI를 width×height로 줄여서 다시 GIF로 인코딩해요 — fps로 샘플링하고 durationMs(≤ 한 바퀴)까지만 잘라요.
 * 업로드한 GIF 배경이 저장 상한(900KB)·프레임·크기 상한을 넘을 때 쓰는 정규화예요. 읽을 수 없는 GIF면 throw해요.
 */
export async function reencodeAnimatedGif(
	dataUri: string,
	options: { width: number; height: number; fps: number; durationMs: number }
): Promise<Buffer> {
	const { renderer } = await getCardRenderer();
	const { node } = await fromJsx(<img src={dataUri} style={{ width: options.width, height: options.height }} />);
	return Buffer.from(
		await renderer.renderAnimation({
			scenes: [{ node, durationMs: options.durationMs }],
			width: options.width,
			height: options.height,
			fps: options.fps,
			format: 'gif'
		})
	);
}

/** 이미지 data URI를 width×height로 다시 그려 JPEG/PNG 버퍼로 돌려줘요 — 업로드 이미지 축소·재인코딩용이에요. 읽을 수 없는 이미지면 throw해요. */
export async function reencodeImage(
	dataUri: string,
	size: { width: number; height: number },
	encode: { format: 'jpeg'; quality: number } | { format: 'png' }
): Promise<Buffer> {
	const { renderer } = await getCardRenderer();
	const { node } = await fromJsx(<img src={dataUri} style={{ width: size.width, height: size.height }} />);
	return Buffer.from(await renderer.render(node, { ...size, ...encode }));
}

/** 레이아웃 크기(width×height)의 노드를 outputWidth 폭으로 균일 축소/확대하는 래퍼 — outputWidth가 같거나 없으면 그대로 돌려줘요. */
function scaledTarget(
	node: ReactNode,
	size: { width: number; height?: number; outputWidth?: number }
): { target: ReactNode; renderWidth: number; renderHeight: number | undefined } {
	if (!size.outputWidth || size.outputWidth === size.width) return { target: node, renderWidth: size.width, renderHeight: size.height };
	const scale = size.outputWidth / size.width;
	const renderWidth = size.outputWidth;
	const renderHeight = size.height ? Math.round(size.height * scale) : undefined;
	const target = (
		<Box style={{ width: renderWidth, ...(renderHeight ? { height: renderHeight } : {}), overflow: 'hidden' }}>
			<Box
				style={{
					width: size.width,
					...(size.height ? { height: size.height } : {}),
					transform: `scale(${scale})`,
					transformOrigin: 'top left'
				}}
			>
				{node}
			</Box>
		</Box>
	);
	return { target, renderWidth, renderHeight };
}

/**
 * Takumi로 카드 노드를 PNG 버퍼로 그려요. 폰트를 못 찾으면 throw해서 라우트가 500으로 알려요.
 * height를 생략하면 레이아웃이 정한 높이로 그려요 (대기열 길이처럼 내용에 따라 달라지는 카드용).
 * outputWidth를 주면 레이아웃 크기(width)는 그대로 두고 출력 PNG만 그 너비로 균일 축소/확대해요 (인사 카드 1200→800).
 */
export async function renderCardPng(node: ReactNode, size: { width: number; height?: number; outputWidth?: number }): Promise<Buffer> {
	const { renderer, hasFont } = await getCardRenderer();
	if (!hasFont) throw new Error('card font unavailable');

	const { target, renderWidth, renderHeight } = scaledTarget(node, size);
	const { node: takumiNode } = await fromJsx(target);
	return Buffer.from(
		await renderer.render(takumiNode, {
			width: renderWidth,
			...(renderHeight ? { height: renderHeight } : {}),
			format: 'png'
		})
	);
}

/**
 * 카드 노드를 애니메이션 WebP로 그려요 (무한 반복). `css`에 `@keyframes`를, 노드 스타일에 `animation`을 넣어 두면
 * durationMs 길이를 fps로 샘플링해요. 높이는 필수예요(프레임 크기를 고정해야 해요). 크기 조절은 `renderCardPng`와 같아요.
 */
export async function renderCardAnimation(
	node: ReactNode,
	options: { width: number; height: number; outputWidth?: number; css: string; durationMs: number; fps: number; quality?: number }
): Promise<Buffer> {
	const { renderer, hasFont } = await getCardRenderer();
	if (!hasFont) throw new Error('card font unavailable');

	const { target, renderWidth, renderHeight } = scaledTarget(node, options);
	const { node: takumiNode } = await fromJsx(target);
	return Buffer.from(
		await renderer.renderAnimation({
			scenes: [{ node: takumiNode, durationMs: options.durationMs }],
			width: renderWidth,
			height: renderHeight ?? options.height,
			fps: options.fps,
			format: 'webp',
			quality: options.quality ?? 80,
			css: [options.css]
		})
	);
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
