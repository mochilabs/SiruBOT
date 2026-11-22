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
	GREETING_CARD_H,
	GREETING_CARD_W,
	renderGreetingTemplate,
	type GreetingAvatarLayer,
	type GreetingImage,
	type GreetingImageLayer,
	type GreetingLayer,
	type GreetingShapeLayer,
	type GreetingTextLayer
} from '@sirubot/utils/memberGreeting';
import { shapeSvg } from './greetingShapes.js';
import { CARD_FONT, h, img, type CardChild, type CardElement } from './kit.js';
import { W } from './tokens.js';

/** 텍스트 좌우 여백 — 카드 가장자리에 붙지 않게 */
const TEXT_MARGIN = 64;
/** 아바타 링 두께 px — 링 지름은 size + 2 × RING */
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
	for (const layer of config.layers) {
		if (layer.hidden) continue; // 숨김 레이어는 렌더에서 건너뛰어요
		children.push(layerNode(layer, vars));
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

/** 카드 %좌표 → 카드 px 중심 */
function center(layer: { x: number; y: number }): { cx: number; cy: number } {
	return { cx: round((GREETING_CARD_W * layer.x) / 100), cy: round((GREETING_CARD_H * layer.y) / 100) };
}

function round(value: number): number {
	return Math.round(value * 100) / 100;
}

/**
 * 텍스트 — 템플릿 치환 후 % 좌표를 기준점으로 그려요. align은 기준점에 대한 정렬이에요(left면 x에서 시작, right면 x에서 끝).
 * x가 가장자리에 가까울 때 잘리지 않게 가까운 가장자리까지의 폭으로 제한하고, 넘치면 말줄임표로 잘라요.
 */
function textNode(layer: GreetingTextLayer, vars: GreetingCardVars): CardElement {
	// 이미지 카드에는 멘션을 못 그려요 — {유저}는 표시 이름으로 폴백해요 (renderGreetingTemplate 계약).
	// 색 이모지는 렌더러의 loadAdditionalAsset이 Twemoji SVG로 그려요 (emoji.ts).
	const text = renderGreetingTemplate(layer.text, {
		displayName: vars.displayName,
		guildName: vars.guildName,
		memberCount: vars.memberCount
	}).trim();
	const { cx, cy } = center(layer);
	const maxW = Math.max(120, 2 * Math.min(cx, GREETING_CARD_W - cx) - TEXT_MARGIN);
	const boxH = Math.ceil(layer.size * 1.5);
	const left = layer.align === 'left' ? cx : layer.align === 'center' ? cx - maxW / 2 : cx - maxW;
	const justify = layer.align === 'left' ? 'flex-start' : layer.align === 'center' ? 'center' : 'flex-end';
	return h(
		'div',
		{
			position: 'absolute',
			left: round(left),
			top: round(cy - boxH / 2),
			width: maxW,
			height: boxH,
			alignItems: 'center',
			justifyContent: justify,
			// 회전은 텍스트 기준점(x, y)을 중심으로 해요 — left/right 정렬에서도 기준점이 그대로여야 해서 원점을 직접 줘요
			...(layer.rotation ? { transform: `rotate(${layer.rotation}deg)`, transformOrigin: `${round(cx - left)}px ${round(boxH / 2)}px` } : {})
		},
		text
			? h(
					'div',
					{
						maxWidth: maxW,
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
						fontSize: layer.size,
						fontWeight: layer.bold ? W.black : W.semibold,
						lineHeight: 1.25,
						color: layer.color,
						// 배경 대비 은은한 드롭 섀도
						textShadow: `0 2px ${Math.max(6, layer.size / 4)}px rgba(0,0,0,0.45)`
					},
					text
				)
			: null
	);
}

/** 아바타 — 원형 이미지(지름 = size) + 링(지름 = size + 12). 이미지가 없으면 '♪' 자리표시자. */
function avatarNode(layer: GreetingAvatarLayer, vars: GreetingCardVars): CardElement {
	const { cx, cy } = center(layer);
	const ringSize = layer.size + RING * 2;
	const inner = vars.avatar
		? img(vars.avatar, { width: layer.size, height: layer.size, borderRadius: 9999, objectFit: 'cover' })
		: h(
				'div',
				{
					width: layer.size,
					height: layer.size,
					borderRadius: 9999,
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
			borderRadius: 9999,
			backgroundColor: layer.ringColor,
			alignItems: 'center',
			justifyContent: 'center'
		},
		inner
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
