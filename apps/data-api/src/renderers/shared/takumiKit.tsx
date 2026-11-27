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
	const dirs = [join(process.cwd(), 'resources/fonts'), join(process.cwd(), '../../resources/fonts')];
	for (const dir of dirs) {
		const path = join(dir, fileName);
		if (existsSync(path)) return path;
	}
	return null;
}

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

export function Box({ style, children }: { style?: CSSProperties; children?: ReactNode }): ReactNode {
	return <div style={{ display: 'flex', ...style }}>{children}</div>;
}

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

export async function renderSvgRaster(svg: string, width: number, height: number, format: 'png' | 'raw'): Promise<Buffer> {
	const { renderer } = await getCardRenderer();
	const uri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
	const { node } = await fromJsx(<img src={uri} style={{ width, height }} />);
	return Buffer.from(await renderer.render(node, { width, height, format }));
}

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

export async function reencodeImage(
	dataUri: string,
	size: { width: number; height: number },
	encode: { format: 'jpeg'; quality: number } | { format: 'png' }
): Promise<Buffer> {
	const { renderer } = await getCardRenderer();
	const { node } = await fromJsx(<img src={dataUri} style={{ width: size.width, height: size.height }} />);
	return Buffer.from(await renderer.render(node, { ...size, ...encode }));
}

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
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

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
