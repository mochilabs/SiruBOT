import { type GreetingPresetBackgroundPlan, greetingPresetBackgroundPlan } from "@sirubot/utils/greetingCardDesign";
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

/**
 * 인사 카드 브라우저 canvas 미리보기 — 서버 skia 렌더러(data-api/src/renderers/memberGreetingCard.ts)와
 * 같은 좌표/드로잉 계약을 따른다. 최종 렌더는 서버가 하므로 이쪽은 근사치면 충분해요.
 * 배경 프리셋 색·그라데이션 파라미터는 공용 계약(@sirubot/utils/greetingCardDesign)에서 받아 그대로 그려요.
 *
 * 좌표계: x/y는 카드 %(0~100, 요소 중심 앵커), size/width/height는 카드 실좌표(1200×675) px.
 */

export const CARD_W = GREETING_CARD_W;
export const CARD_H = GREETING_CARD_H;
const TEXT_MARGIN = 64;
const FONT_FAMILY = '"Pretendard JP", "Twemoji Mozilla", sans-serif';

/** 템플릿 변수 치환 — 미리보기용 샘플 값. {서버}는 호출부가 준 이름(없으면 빈 문자열), {멤버수}는 "1"이에요 */
export function sampleGreetingText(text: string, guildName = ""): string {
	return text
		.replaceAll("{유저}", "유저")
		.replaceAll("{유저이름}", "유저")
		.replaceAll("{서버}", guildName)
		.replaceAll("{멤버수}", "1");
}

/** dataURI/URL 이미지 로드 캐시 — 편집마다 재디코딩하지 않게 모듈 단위로 유지해요 */
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

export interface GreetingDrawOptions {
	selectedId: string | null;
	avatarSrc: string | null;
	guildName: string;
}

/** 카드 전체를 레이어 순서대로 그려요. 편집 상태가 바뀔 때마다 호출돼요. */
export async function drawGreetingPreview(
	ctx: CanvasRenderingContext2D,
	image: GreetingImage,
	options: GreetingDrawOptions,
	isCancelled?: () => boolean
): Promise<void> {
	ctx.clearRect(0, 0, CARD_W, CARD_H);
	await drawBackground(ctx, image.background);
	if (isCancelled?.()) return;

	for (const layer of image.layers) {
		if (layer.hidden) continue;
		await drawLayer(ctx, layer, options);
		if (isCancelled?.()) return;
	}

	if (options.selectedId) {
		const layer = image.layers.find((item) => item.id === options.selectedId);
		if (layer && !layer.hidden) drawSelection(ctx, layer);
	}
}

/** 배경 — 업로드 dataURI(cover-fit) 우선, 실패·부재 시 프리셋 + 어두운 스크림 */
async function drawBackground(ctx: CanvasRenderingContext2D, background: GreetingImage["background"]): Promise<void> {
	if (background.dataUri) {
		const img = await loadImage(background.dataUri);
		if (img) {
			drawCover(ctx, img, CARD_W, CARD_H);
			return;
		}
	}
	const plan = greetingPresetBackgroundPlan(CARD_W, CARD_H, background.presetId);
	drawPresetBackground(ctx, plan);
	// 그라디언트 위에서 흰 텍스트가 읽히도록 은은한 스크림
	ctx.fillStyle = plan.scrim;
	ctx.fillRect(0, 0, CARD_W, CARD_H);
}

/** 프리셋 배경 — 공용 계약(greetingCardDesign)의 계획을 대각 그라디언트 + 코너 글로우로 옮겨 그려요 */
export function drawPresetBackground(ctx: CanvasRenderingContext2D, plan: GreetingPresetBackgroundPlan): void {
	ctx.fillStyle = plan.base;
	ctx.fillRect(0, 0, CARD_W, CARD_H);
	const gradient = ctx.createLinearGradient(plan.linear.x0, plan.linear.y0, plan.linear.x1, plan.linear.y1);
	for (const [offset, color] of plan.linear.stops) {
		gradient.addColorStop(offset, color);
	}
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, CARD_W, CARD_H);
	const glow = ctx.createRadialGradient(plan.glow.cx, plan.glow.cy, 0, plan.glow.cx, plan.glow.cy, plan.glow.radius);
	for (const [offset, color] of plan.glow.stops) {
		glow.addColorStop(offset, color);
	}
	ctx.fillStyle = glow;
	ctx.fillRect(0, 0, CARD_W, CARD_H);
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number): void {
	const iw = img.naturalWidth;
	const ih = img.naturalHeight;
	if (!iw || !ih) return;
	const scale = Math.max(w / iw, h / ih);
	ctx.drawImage(img, (w - iw * scale) / 2, (h - ih * scale) / 2, iw * scale, ih * scale);
}

async function drawLayer(ctx: CanvasRenderingContext2D, layer: GreetingLayer, options: GreetingDrawOptions): Promise<void> {
	const cx = (layer.x / 100) * CARD_W;
	const cy = (layer.y / 100) * CARD_H;
	switch (layer.type) {
		case "text":
			drawTextLayer(ctx, layer, cx, cy, options.guildName);
			return;
		case "avatar":
			await drawAvatarLayer(ctx, layer, cx, cy, options.avatarSrc);
			return;
		case "image":
			await drawImageLayer(ctx, layer, cx, cy);
			return;
		case "shape":
			drawShapeLayer(ctx, layer, cx, cy);
			return;
	}
}

function textFont(layer: GreetingTextLayer): string {
	return `${layer.bold ? 700 : 500} ${layer.size}px ${FONT_FAMILY}`;
}

function drawTextLayer(ctx: CanvasRenderingContext2D, layer: GreetingTextLayer, cx: number, cy: number, guildName: string): void {
	const rendered = sampleGreetingText(layer.text, guildName);
	ctx.save();
	ctx.font = textFont(layer);
	ctx.textAlign = layer.align;
	ctx.textBaseline = "middle";
	ctx.fillStyle = layer.color;
	ctx.shadowColor = "rgba(0,0,0,0.45)";
	ctx.shadowBlur = Math.max(6, layer.size / 4);
	ctx.shadowOffsetY = 2;
	// x가 가장자리에 가까우면 잘리지 않게 — 서버 렌더러와 같은 최대 폭 제한
	const maxW = Math.max(120, 2 * Math.min(cx, CARD_W - cx) - TEXT_MARGIN);
	ctx.fillText(truncate(ctx, rendered, maxW), cx, cy);
	ctx.restore();
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
	if (ctx.measureText(text).width <= maxW) return text;
	let result = text;
	while (result.length > 0 && ctx.measureText(`${result}…`).width > maxW) {
		result = result.slice(0, -1);
	}
	return `${result}…`;
}

async function drawAvatarLayer(ctx: CanvasRenderingContext2D, layer: GreetingAvatarLayer, cx: number, cy: number, avatarSrc: string | null): Promise<void> {
	const r = layer.size / 2;
	// 링
	ctx.save();
	ctx.beginPath();
	ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
	ctx.fillStyle = layer.ringColor;
	ctx.fill();
	ctx.restore();

	const img = avatarSrc ? await loadImage(avatarSrc) : null;
	if (img) {
		drawCircleImage(ctx, img, cx, cy, r);
		return;
	}
	// 플레이스홀더 — 서버 폴백과 같은 톤
	ctx.save();
	ctx.beginPath();
	ctx.arc(cx, cy, r, 0, Math.PI * 2);
	ctx.fillStyle = "#35212a";
	ctx.fill();
	ctx.fillStyle = "rgba(201,168,181,0.6)";
	ctx.font = `600 ${Math.round(layer.size * 0.36)}px ${FONT_FAMILY}`;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText("♪", cx, cy + 4);
	ctx.restore();
}

function drawCircleImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cx: number, cy: number, r: number): void {
	ctx.save();
	ctx.beginPath();
	ctx.arc(cx, cy, r, 0, Math.PI * 2);
	ctx.closePath();
	ctx.clip();
	const side = r * 2;
	ctx.drawImage(img, cx - r, cy - r, side, side);
	ctx.restore();
}

async function drawImageLayer(ctx: CanvasRenderingContext2D, layer: GreetingImageLayer, cx: number, cy: number): Promise<void> {
	const img = await loadImage(layer.dataUri);
	if (!img) return;
	ctx.save();
	ctx.globalAlpha = layer.opacity;
	ctx.drawImage(img, cx - layer.width / 2, cy - layer.height / 2, layer.width, layer.height);
	ctx.restore();
}

function drawShapeLayer(ctx: CanvasRenderingContext2D, layer: GreetingShapeLayer, cx: number, cy: number): void {
	ctx.save();
	ctx.globalAlpha = layer.opacity;
	ctx.fillStyle = layer.color;
	if (layer.shape === "circle") {
		ctx.beginPath();
		ctx.ellipse(cx, cy, layer.width / 2, layer.height / 2, 0, 0, Math.PI * 2);
		ctx.fill();
	} else {
		ctx.fillRect(cx - layer.width / 2, cy - layer.height / 2, layer.width, layer.height);
	}
	ctx.restore();
}

function drawSelection(ctx: CanvasRenderingContext2D, layer: GreetingLayer): void {
	const bounds = layerBounds(ctx, layer);
	ctx.save();
	ctx.strokeStyle = "#ffffff";
	ctx.lineWidth = 2;
	ctx.setLineDash([6, 4]);
	ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
	ctx.setLineDash([]);
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
	ctx.restore();
}

function measureLayerTextWidth(ctx: CanvasRenderingContext2D, layer: GreetingTextLayer): number {
	ctx.save();
	ctx.font = textFont(layer);
	const width = ctx.measureText(sampleGreetingText(layer.text, "")).width;
	ctx.restore();
	return width;
}

/** 레이어의 카드 px 바운딩 박스(왼쪽 위 기준) — 선택 테두리·히트테스트 공용이에요 */
export function layerBounds(ctx: CanvasRenderingContext2D, layer: GreetingLayer): { x: number; y: number; w: number; h: number } {
	const cx = (layer.x / 100) * CARD_W;
	const cy = (layer.y / 100) * CARD_H;
	switch (layer.type) {
		case "text": {
			const w = measureLayerTextWidth(ctx, layer) + 16;
			const h = layer.size + 16;
			return { x: cx - w / 2, y: cy - h / 2, w, h };
		}
		case "avatar": {
			const d = layer.size + 12;
			return { x: cx - d / 2, y: cy - d / 2, w: d, h: d };
		}
		case "image":
			return { x: cx - layer.width / 2, y: cy - layer.height / 2, w: layer.width, h: layer.height };
		case "shape":
			return { x: cx - layer.width / 2, y: cy - layer.height / 2, w: layer.width, h: layer.height };
	}
}

/** 위(뒤쪽)에서부터 겹친 레이어를 찾아요 — 반환 순서는 레이어 배열 역순(가장 앞부터)이에요 */
export function hitTestLayer(ctx: CanvasRenderingContext2D, layers: GreetingLayer[], px: number, py: number): GreetingLayer | null {
	for (let i = layers.length - 1; i >= 0; i--) {
		const layer = layers[i];
		const b = layerBounds(ctx, layer);
		if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return layer;
	}
	return null;
}

/** 0~100으로 클램프 후 소수 1자리 반올림 — 위치 입력 공용이에요 */
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

/** 레이어 패널에서 보여줄 한 줄 라벨 */
export function layerLabel(layer: GreetingLayer): string {
	switch (layer.type) {
		case "text":
			return layer.text.trim() || "텍스트";
		case "avatar":
			return "아바타";
		case "image":
			return "이미지";
		case "shape":
			return layer.shape === "circle" ? "원" : "사각형";
	}
}
