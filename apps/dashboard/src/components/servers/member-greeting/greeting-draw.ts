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
 * 인사 카드 편집기 공용 헬퍼 — 레이어 바운딩 박스·히트테스트·생성, 선택 오버레이(`drawGreetingSelection`).
 * 카드 미리보기 자체는 `greeting-svg.ts`(@sirubot/cards + satori)가 그려요.
 * 좌표계: x/y는 카드 %(0~100, 요소 중심 앵커), size/width/height는 카드 실좌표(1200×675) px.
 */

export const CARD_W = GREETING_CARD_W;
export const CARD_H = GREETING_CARD_H;
const FONT_FAMILY = '"Pretendard JP", "Twemoji Mozilla", sans-serif';

/** 템플릿 변수 치환 — 텍스트 레이어 폭 측정용 샘플 값 */
function sampleGreetingText(text: string, guildName = ""): string {
	return text
		.replaceAll("{유저}", "유저")
		.replaceAll("{유저이름}", "유저")
		.replaceAll("{서버}", guildName)
		.replaceAll("{멤버수}", "1");
}

/** dataURI/URL 이미지 로드 캐시 — 업로드 이미지 크기 측정 등에 써요 */
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

/** 선택한 레이어의 테두리·핸들만 그려요 — satori SVG 위에 겹친 투명 canvas에서 써요. */
export function drawGreetingSelection(ctx: CanvasRenderingContext2D, image: GreetingImage, selectedId: string | null): void {
	ctx.clearRect(0, 0, CARD_W, CARD_H);
	if (!selectedId) return;
	const layer = image.layers.find((item) => item.id === selectedId);
	if (layer && !layer.hidden) drawSelection(ctx, layer);
}

function textFont(layer: GreetingTextLayer): string {
	return `${layer.bold ? 700 : 500} ${layer.size}px ${FONT_FAMILY}`;
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

const SHAPE_LABELS = { rect: "사각형", circle: "원", triangle: "삼각형", diamond: "마름모", hexagon: "육각형", star: "별", heart: "하트" } as const;

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
			return SHAPE_LABELS[layer.shape];
	}
}
