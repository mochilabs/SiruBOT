/**
 * 인사(환영/작별) 카드 — GreetingImage 설정과 멤버 값으로 Takumi 노드를 만드는 순수 함수예요.
 * data-api(PNG)와 대시보드 미리보기(SVG)가 이 함수 하나를 같이 써서 두 결과가 같아요.
 *
 * 계약은 `@sirubot/utils/memberGreeting`을 그대로 따라요: 카드는 1200×675, 레이어 x/y는 카드 크기 대비 %(요소 중심 앵커),
 * size/width/height는 카드 실좌표 px예요. 배경 프리셋 색·기하는 `@sirubot/utils/greetingCardDesign`의 계획을 CSS 그라디언트로 옮겨요.
 * 폰트는 호출자가 Takumi에 등록해요: 일반 글씨는 600, 굵은 글씨는 900(`W.semibold`, `W.black`)만 써서 두 런타임이 같은 정적 서브셋을 공유해요.
 */
import { greetingPresetBackgroundPlan } from '@sirubot/utils/greetingCardDesign';
import {
	greetingAnimationDurationMs,
	GREETING_CARD_H,
	GREETING_CARD_W,
	renderGreetingTemplate,
	type GreetingAvatarLayer,
	type GreetingImage,
	type GreetingImageLayer,
	type GreetingLayer,
	type GreetingShadow,
	type GreetingShapeLayer,
	type GreetingTextLayer
} from '@sirubot/utils/memberGreeting';
import { hexToRgba } from './artwork.js';
import { animationDeclaration } from './greetingAnimations.js';
import { shapeSvg } from './greetingShapes.js';
import { CARD_FONT, h, img, type CardChild, type CardElement } from './kit.js';
import { W } from './tokens.js';

/** 텍스트 좌우 여백 — 카드 가장자리에 붙지 않게 */
const TEXT_MARGIN = 64;
/** 아바타 링 기본 두께 px — 링 지름은 size + 2 × ringWidth */
const RING = 6;

export interface GreetingCardVars {
	displayName: string;
	guildName: string;
	memberCount: number;
	/** 아바타 data URI. Takumi `<img>`에 그대로 써요. 없으면 '♪' 자리표시자를 그려요 */
	avatar: string | null;
}

const fill = { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' } as const;

/** 인사 카드 노드 — 1200×675 루트 하나예요. Takumi에 `{ width: 1200, height: 675 }`로 넘겨요. */
export function greetingCard(config: GreetingImage, vars: GreetingCardVars): CardElement {
	const children: CardChild[] = [...backgroundNodes(config.background)];
	// 움직이는 레이어가 있으면 카드 한 바퀴 길이를 정해서 모든 레이어 주기를 그 약수로 맞춰요 (WebP 반복이 끊기지 않게)
	const loopMs = greetingAnimationDurationMs(config);
	for (const layer of config.layers) {
		if (layer.hidden) continue; // 숨김 레이어는 렌더에서 건너뛰어요
		children.push(withAnimation(layerNode(layer, vars), layer, loopMs));
	}
	return h('div', { position: 'relative', width: GREETING_CARD_W, height: GREETING_CARD_H, overflow: 'hidden', fontFamily: CARD_FONT }, children);
}

/** 배경 — 업로드 dataURI(cover-fit) 우선, 없으면 프리셋 계획(바닥색 → 대각 그라디언트 → 코너 글로우 → 스크림) */
function backgroundNodes(background: GreetingImage['background']): CardElement[] {
	if (background.dataUri) return [img(background.dataUri, { ...fill, objectFit: 'cover' })];
	const plan = greetingPresetBackgroundPlan(GREETING_CARD_W, GREETING_CARD_H, background.presetId);
	const { linear, glow } = plan;
	// canvas 그라디언트는 (x0,y0)→(x1,y1) 벡터를 따라가요. CSS 각도(0deg = 위, 시계 방향)로 바꾸면 길이·시작 모서리가 같아요.
	const angle = (Math.atan2(linear.x1 - linear.x0, -(linear.y1 - linear.y0)) * 180) / Math.PI;
	const linearStops = linear.stops.map(([offset, color]) => `${color} ${offset * 100}%`).join(', ');
	const glowStops = glow.stops.map(([offset, color]) => `${color} ${offset * 100}%`).join(', ');
	return [
		h('div', { ...fill, backgroundColor: plan.base }),
		h('div', { ...fill, backgroundImage: `linear-gradient(${round(angle)}deg, ${linearStops})` }),
		h('div', {
			...fill,
			backgroundImage: `radial-gradient(circle ${round(glow.radius)}px at ${round(glow.cx)}px ${round(glow.cy)}px, ${glowStops})`
		}),
		// 그라디언트 위에서 흰 타이틀이 읽히도록 은은한 어두운 스크림
		h('div', { ...fill, backgroundColor: plan.scrim })
	];
}

function layerNode(layer: GreetingLayer, vars: GreetingCardVars): CardElement {
	switch (layer.type) {
		case 'text':
			return textNode(layer, vars);
		case 'avatar':
			return avatarNode(layer, vars);
		case 'image':
			return imageNode(layer);
		case 'shape':
			return shapeNode(layer);
	}
}

/**
 * 움직임이 있는 레이어는 같은 박스(left/top/width/height)를 가진 바깥 div로 감싸서 거기에 `animation`을 입혀요.
 * 안쪽 레이어의 회전·투명도·흐림은 그대로라 움직임과 곱해져요(대체하지 않아요). 움직임이 없으면 노드를 그대로 돌려줘요.
 * 텍스트는 안쪽 회전과 같은 기준점(x, y)을 변환 원점으로 써서 left/right 정렬에서도 제자리에서 움직여요.
 */
function withAnimation(node: CardElement, layer: GreetingLayer, loopMs: number): CardElement {
	if (!layer.animation) return node;
	const style = (node.props.style ?? {}) as Record<string, string | number>;
	const { left, top, width, height } = style;
	const inner = { ...node, props: { ...node.props, style: { ...style, left: 0, top: 0 } } } as CardElement;
	return h(
		'div',
		{
			position: 'absolute',
			left: left ?? 0,
			top: top ?? 0,
			width: width ?? 0,
			height: height ?? 0,
			...(layer.type === 'text' ? { transformOrigin: textAnchorOrigin(layer) } : {}),
			animation: animationDeclaration(layer.animation, loopMs)
		},
		inner
	);
}

/** 카드 %좌표 → 카드 px 중심 */
function center(layer: { x: number; y: number }): { cx: number; cy: number } {
	return { cx: round((GREETING_CARD_W * layer.x) / 100), cy: round((GREETING_CARD_H * layer.y) / 100) };
}

function round(value: number): number {
	return Math.round(value * 100) / 100;
}

/** 텍스트 줄 간격 기본값 — 예전 카드와 같아요 */
const DEFAULT_LINE_HEIGHT = 1.25;

/**
 * 텍스트 박스 — 기준점(x, y)을 중심으로 한 가로 폭·세로 높이와 left/top이에요.
 * maxWidth가 없으면 가까운 카드 가장자리까지의 폭(예전 동작), 있으면 그 폭을 그대로 써요.
 * 줄바꿈(wrap)이면 박스 높이를 줄 수(maxLines, 없으면 6)만큼 잡고 글은 세로 가운데에 놓여요. 회전·움직임의 변환 원점도 여기서 나와요.
 */
function textBox(layer: GreetingTextLayer): {
	left: number;
	top: number;
	width: number;
	height: number;
	originX: number;
	originY: number;
	wrap: boolean;
} {
	const { cx, cy } = center(layer);
	const wrap = layer.maxWidth !== undefined && (layer.overflow ?? 'wrap') === 'wrap';
	const width = layer.maxWidth ?? Math.max(120, 2 * Math.min(cx, GREETING_CARD_W - cx) - TEXT_MARGIN);
	const lineHeight = layer.lineHeight ?? DEFAULT_LINE_HEIGHT;
	const height = wrap ? Math.ceil(layer.size * lineHeight * (layer.maxLines ?? 6)) : Math.ceil(layer.size * Math.max(1.5, lineHeight));
	const left = layer.align === 'left' ? cx : layer.align === 'center' ? cx - width / 2 : cx - width;
	return { left: round(left), top: round(cy - height / 2), width, height, originX: round(cx - left), originY: round(height / 2), wrap };
}

/** 텍스트 박스 안에서 기준점(x, y)의 위치 — 회전·움직임의 변환 원점이에요 (box 좌표 px). */
function textAnchorOrigin(layer: GreetingTextLayer): string {
	const box = textBox(layer);
	return `${box.originX}px ${box.originY}px`;
}

/** 예전 카드의 기본 그림자 — 배경 대비 은은한 드롭 섀도 */
function defaultTextShadow(size: number): string {
	return `0 2px ${Math.max(6, size / 4)}px rgba(0,0,0,0.45)`;
}

/** 그림자 한 겹 → CSS (box-shadow·text-shadow 공용) */
function shadowCss(shadow: GreetingShadow): string {
	return `${shadow.offsetX}px ${shadow.offsetY}px ${shadow.blur}px ${hexToRgba(shadow.color, shadow.opacity)}`;
}

/**
 * 텍스트 안쪽 div 스타일 — 굵기·간격·색 효과를 모아요. 효과 필드가 없으면 예전 스타일과 같아요.
 * 그라디언트는 글자를 투명하게 두고 `background-clip: text`로 칠하고, 외곽선은 `-webkit-text-stroke`예요 (둘 다 Takumi 네이티브·WASM 공통).
 */
function textStyle(layer: GreetingTextLayer, width: number, wrap: boolean): Record<string, string | number> {
	const style: Record<string, string | number> = {
		maxWidth: width,
		fontSize: layer.size,
		fontWeight: layer.weight ?? (layer.bold ? W.black : W.semibold),
		lineHeight: layer.lineHeight ?? DEFAULT_LINE_HEIGHT,
		color: layer.color
	};
	if (wrap) {
		style.textAlign = layer.align;
		if (layer.maxLines) {
			// 줄 수 제한 — 높이를 줄 수만큼으로 자르고 말줄임표를 붙여요 (Takumi는 clip 박스의 높이 초과를 말줄임해요)
			style.maxHeight = Math.round(layer.size * (layer.lineHeight ?? DEFAULT_LINE_HEIGHT) * layer.maxLines);
			style.overflow = 'hidden';
			style.textOverflow = 'ellipsis';
		}
	} else {
		style.overflow = 'hidden';
		style.textOverflow = 'ellipsis';
		style.whiteSpace = 'nowrap';
	}
	if (layer.letterSpacing) style.letterSpacing = `${layer.letterSpacing}px`;
	if (layer.shadow !== null) style.textShadow = layer.shadow ? shadowCss(layer.shadow) : defaultTextShadow(layer.size);
	if (layer.stroke && layer.stroke.width > 0) style.WebkitTextStroke = `${layer.stroke.width}px ${layer.stroke.color}`;
	if (layer.gradient) {
		// 그라디언트 각도는 도형과 같은 기준이에요 (0° = 왼→오른쪽, 90° = 위→아래). CSS 각도는 0deg가 위쪽이라 90을 더해요.
		style.backgroundImage = `linear-gradient(${(layer.gradient.angle ?? 0) + 90}deg, ${layer.color}, ${layer.gradient.to})`;
		style.backgroundClip = 'text';
		style.color = 'transparent';
	}
	return style;
}

/**
 * 텍스트 — 템플릿 치환 후 % 좌표를 기준점으로 그려요. align은 기준점에 대한 정렬이에요(left면 x에서 시작, right면 x에서 끝).
 * 기본은 가까운 가장자리까지의 폭으로 제한하고 넘치면 말줄임표로 잘라요. maxWidth가 있으면 그 폭에서 줄바꿈(기본) 또는 말줄임해요.
 */
function textNode(layer: GreetingTextLayer, vars: GreetingCardVars): CardElement {
	// 이미지 카드에는 멘션을 못 그려요 — {유저}는 표시 이름으로 폴백해요 (renderGreetingTemplate 계약).
	// 색 이모지는 렌더러의 loadAdditionalAsset이 Twemoji SVG로 그려요 (emoji.ts).
	const text = renderGreetingTemplate(layer.text, {
		displayName: vars.displayName,
		guildName: vars.guildName,
		memberCount: vars.memberCount
	}).trim();
	const box = textBox(layer);
	const justify = layer.align === 'left' ? 'flex-start' : layer.align === 'center' ? 'center' : 'flex-end';
	return h(
		'div',
		{
			position: 'absolute',
			left: box.left,
			top: box.top,
			width: box.width,
			height: box.height,
			alignItems: 'center',
			justifyContent: justify,
			// 회전은 텍스트 기준점(x, y)을 중심으로 해요 — left/right 정렬에서도 기준점이 그대로여야 해서 원점을 직접 줘요
			...(layer.rotation ? { transform: `rotate(${layer.rotation}deg)`, transformOrigin: textAnchorOrigin(layer) } : {})
		},
		text ? h('div', textStyle(layer, box.width, box.wrap), text) : null
	);
}

/** 아바타 모양별 안쪽 모서리 반경 px — circle은 항상 원이라 큰 값을 줘요 */
function avatarRadius(layer: GreetingAvatarLayer): number {
	switch (layer.shape ?? 'circle') {
		case 'circle':
			return 9999;
		case 'rounded':
			return layer.cornerRadius ?? Math.round(layer.size * 0.22);
		case 'square':
			return 0;
	}
}

/**
 * 아바타 — 이미지(지름 = size) + 링(두께 ringWidth, 기본 6) + 선택 그림자·글로우.
 * 모양은 원(기본)·둥근 사각형·사각형이고, 링은 안쪽 모양에 두께만큼 바깥으로 이어져요. 이미지가 없으면 '♪' 자리표시자.
 */
function avatarNode(layer: GreetingAvatarLayer, vars: GreetingCardVars): CardElement {
	const { cx, cy } = center(layer);
	const ringWidth = layer.ringWidth ?? RING;
	const ringSize = layer.size + ringWidth * 2;
	const inner = avatarRadius(layer);
	const outer = inner >= 9999 ? 9999 : inner === 0 ? 0 : inner + ringWidth;
	const shadows = [
		layer.shadow ? shadowCss(layer.shadow) : null,
		layer.glow ? `0 0 ${layer.glow.blur}px ${layer.glow.spread}px ${hexToRgba(layer.glow.color, layer.glow.opacity)}` : null
	].filter((value): value is string => value !== null);
	const content = vars.avatar
		? img(vars.avatar, { width: layer.size, height: layer.size, borderRadius: inner, objectFit: 'cover' })
		: h(
				'div',
				{
					width: layer.size,
					height: layer.size,
					borderRadius: inner,
					backgroundColor: '#35212a',
					alignItems: 'center',
					justifyContent: 'center',
					color: 'rgba(201,168,181,0.6)',
					fontSize: Math.round(layer.size * 0.36),
					fontWeight: W.semibold
				},
				'♪'
			);
	return h(
		'div',
		{
			position: 'absolute',
			left: round(cx - ringSize / 2),
			top: round(cy - ringSize / 2),
			width: ringSize,
			height: ringSize,
			borderRadius: outer,
			backgroundColor: layer.ringColor,
			alignItems: 'center',
			justifyContent: 'center',
			...(shadows.length > 0 ? { boxShadow: shadows.join(', ') } : {})
		},
		content
	);
}

/** 이미지 — 업로드 스티커/로고 dataURI를 width/height 크기로 중심 기준에 놓아요. */
function imageNode(layer: GreetingImageLayer): CardElement {
	const { cx, cy } = center(layer);
	return img(layer.dataUri, {
		position: 'absolute',
		left: round(cx - layer.width / 2),
		top: round(cy - layer.height / 2),
		width: layer.width,
		height: layer.height,
		opacity: layer.opacity,
		...(layer.rotation ? { transform: `rotate(${layer.rotation}deg)` } : {})
	});
}

/** 도형 — SVG(`shapeSvg`)를 중심 기준에 놓고, 회전·투명도·흐림을 바깥 래퍼에 입혀요. */
function shapeNode(layer: GreetingShapeLayer): CardElement {
	const { cx, cy } = center(layer);
	return h(
		'div',
		{
			position: 'absolute',
			left: round(cx - layer.width / 2),
			top: round(cy - layer.height / 2),
			width: layer.width,
			height: layer.height,
			opacity: layer.opacity,
			...(layer.rotation ? { transform: `rotate(${layer.rotation}deg)` } : {}),
			...(layer.blur ? { filter: `blur(${layer.blur}px)` } : {})
		},
		shapeSvg(layer)
	);
}
