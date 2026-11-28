import {
	GREETING_CARD_H,
	GREETING_CARD_W,
	type GreetingAvatarLayer,
	type GreetingImage,
	type GreetingImageLayer,
	type GreetingLayer,
	type GreetingShapeLayer,
	type GreetingTextLayer
} from "@sirubot/utils/memberGreeting";

import { type Box, type SnapGuide, unionBox } from "./greeting-snap";

export const CARD_W = GREETING_CARD_W;
export const CARD_H = GREETING_CARD_H;
const FONT_FAMILY = '"Pretendard JP", "Twemoji Mozilla", sans-serif';

function sampleGreetingText(text: string, guildName = ""): string {
	return text
		.replaceAll("{유저}", "유저")
		.replaceAll("{유저이름}", "유저")
		.replaceAll("{서버}", guildName)
		.replaceAll("{멤버수}", "1");
}

const imageCache = new Map<string, HTMLImageElement | null>();

export function loadImage(src: string): Promise<HTMLImageElement | null> {
	const cached = imageCache.get(src);
	if (cached !== undefined) return Promise.resolve(cached);
	return new Promise((resolve) => {
		const img = new Image();
		img.onload = () => {
			imageCache.set(src, img);
			resolve(img);
		};
		img.onerror = () => {
			imageCache.set(src, null);
			resolve(null);
		};
		img.src = src;
	});
}

export interface GreetingOverlay {
	guides?: readonly SnapGuide[];
	marquee?: Box | null;
}

export function drawGreetingSelection(ctx: CanvasRenderingContext2D, image: GreetingImage, selectedIds: readonly string[], overlay: GreetingOverlay = {}): void {
	ctx.clearRect(0, 0, CARD_W, CARD_H);
	const selected = image.layers.filter((item) => selectedIds.includes(item.id) && !item.hidden);
	for (const layer of selected) drawSelection(ctx, layer, selected.length === 1);
	if (selected.length > 1) {
		const union = unionBox(selected.map((layer) => layerBounds(ctx, layer)));
		if (union) {
			ctx.save();
			ctx.strokeStyle = "#ffffff";
			ctx.lineWidth = 1;
			ctx.setLineDash([2, 3]);
			ctx.strokeRect(union.x, union.y, union.w, union.h);
			ctx.restore();
		}
	}
	if (overlay.guides?.length) {
		ctx.save();
		ctx.strokeStyle = "#ff3b8b";
		ctx.lineWidth = 1.5;
		for (const guide of overlay.guides) {
			ctx.beginPath();
			if (guide.axis === "x") {
				ctx.moveTo(guide.pos, guide.from);
				ctx.lineTo(guide.pos, guide.to);
			} else {
				ctx.moveTo(guide.from, guide.pos);
				ctx.lineTo(guide.to, guide.pos);
			}
			ctx.stroke();
		}
		ctx.restore();
	}
	if (overlay.marquee) {
		const m = overlay.marquee;
		ctx.save();
		ctx.fillStyle = "rgba(255,255,255,0.15)";
		ctx.strokeStyle = "#ffffff";
		ctx.lineWidth = 1.5;
		ctx.setLineDash([6, 4]);
		ctx.fillRect(m.x, m.y, m.w, m.h);
		ctx.strokeRect(m.x, m.y, m.w, m.h);
		ctx.restore();
	}
}

export function textWeight(layer: GreetingTextLayer): number {
	return layer.weight ?? (layer.bold ? 900 : 600);
}

function textFont(layer: GreetingTextLayer): string {
	return `${textWeight(layer)} ${layer.size}px ${FONT_FAMILY}`;
}

function drawSelection(ctx: CanvasRenderingContext2D, layer: GreetingLayer, handles: boolean): void {
	const bounds = layerBounds(ctx, layer);
	ctx.save();
	ctx.strokeStyle = "#ffffff";
	ctx.lineWidth = 2;
	ctx.setLineDash([6, 4]);
	ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
	ctx.setLineDash([]);
	if (handles) {
		const handle = 8;
		ctx.fillStyle = "#ffffff";
		for (const [hx, hy] of [
			[bounds.x, bounds.y],
			[bounds.x + bounds.w, bounds.y],
			[bounds.x, bounds.y + bounds.h],
			[bounds.x + bounds.w, bounds.y + bounds.h]
		]) {
			ctx.fillRect(hx - handle / 2, hy - handle / 2, handle, handle);
		}
	}
	ctx.restore();
}

function measureLayerTextWidth(ctx: CanvasRenderingContext2D, layer: GreetingTextLayer): number {
	ctx.save();
	ctx.font = textFont(layer);
	const text = sampleGreetingText(layer.text, "");
	const width = ctx.measureText(text).width + (layer.letterSpacing ?? 0) * [...text].length;
	ctx.restore();
	return width;
}

function textBounds(ctx: CanvasRenderingContext2D, layer: GreetingTextLayer, cx: number, cy: number): Box {
	const measured = measureLayerTextWidth(ctx, layer);
	const lineHeight = layer.size * (layer.lineHeight ?? 1.25);
	const edgeWidth = Math.max(120, 2 * Math.min(cx, CARD_W - cx) - 64);
	const limit = layer.maxWidth ?? edgeWidth;
	const wrap = layer.maxWidth !== undefined && (layer.overflow ?? "wrap") === "wrap";
	const lines = wrap ? Math.min(layer.maxLines ?? Infinity, Math.max(1, Math.ceil(measured / limit))) : 1;
	const w = Math.min(measured, limit) + 16;
	const h = (wrap ? lines * lineHeight : layer.size) + 16;
	const left = layer.align === "left" ? cx - 8 : layer.align === "center" ? cx - w / 2 : cx - w + 8;
	return { x: left, y: cy - h / 2, w, h };
}

export function layerBounds(ctx: CanvasRenderingContext2D, layer: GreetingLayer): Box {
	const cx = (layer.x / 100) * CARD_W;
	const cy = (layer.y / 100) * CARD_H;
	switch (layer.type) {
		case "text":
			return textBounds(ctx, layer, cx, cy);
		case "avatar": {
			const d = layer.size + (layer.ringWidth ?? 6) * 2;
			return { x: cx - d / 2, y: cy - d / 2, w: d, h: d };
		}
		case "image":
			return { x: cx - layer.width / 2, y: cy - layer.height / 2, w: layer.width, h: layer.height };
		case "shape":
			return { x: cx - layer.width / 2, y: cy - layer.height / 2, w: layer.width, h: layer.height };
	}
}

export function hitTestLayer(ctx: CanvasRenderingContext2D, layers: readonly GreetingLayer[], px: number, py: number): GreetingLayer | null {
	for (let i = layers.length - 1; i >= 0; i--) {
		const layer = layers[i];
		const b = layerBounds(ctx, layer);
		if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return layer;
	}
	return null;
}

export function clampRatio(value: number): number {
	return Math.round(Math.min(100, Math.max(0, value)) * 10) / 10;
}

export function createTextLayer(): GreetingTextLayer {
	return { id: crypto.randomUUID(), type: "text", x: 50, y: 50, size: 40, color: "#ffffff", bold: true, align: "center", text: "새 텍스트" };
}

export function createAvatarLayer(): GreetingAvatarLayer {
	return { id: crypto.randomUUID(), type: "avatar", x: 50, y: 30, size: 180, ringColor: "#ffffff" };
}

export function createImageLayer(dataUri: string, width: number, height: number): GreetingImageLayer {
	return { id: crypto.randomUUID(), type: "image", x: 50, y: 50, width, height, dataUri, opacity: 1 };
}

export function createShapeLayer(): GreetingShapeLayer {
	return { id: crypto.randomUUID(), type: "shape", shape: "rect", x: 50, y: 50, width: 400, height: 200, color: "#ff85c1", opacity: 0.6 };
}

const SHAPE_LABELS = { rect: "사각형", circle: "원", triangle: "삼각형", diamond: "마름모", hexagon: "육각형", star: "별", heart: "하트" } as const;

export function layerLabel(layer: GreetingLayer): string {
	switch (layer.type) {
		case "text":
			return layer.text.trim() || "텍스트";
		case "avatar":
			return "아바타";
		case "image":
			return "이미지";
		case "shape":
			return SHAPE_LABELS[layer.shape];
	}
}
