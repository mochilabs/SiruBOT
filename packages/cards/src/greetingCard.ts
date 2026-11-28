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

const TEXT_MARGIN = 64;
const RING = 6;

export interface GreetingCardVars {
	displayName: string;
	guildName: string;
	memberCount: number;
	avatar: string | null;
}

const fill = { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' } as const;

export function greetingCard(config: GreetingImage, vars: GreetingCardVars): CardElement {
	const children: CardChild[] = [...backgroundNodes(config.background)];
	const loopMs = greetingAnimationDurationMs(config);
	for (const layer of config.layers) {
		if (layer.hidden) continue;
		children.push(withAnimation(layerNode(layer, vars), layer, loopMs));
	}
	return h('div', { position: 'relative', width: GREETING_CARD_W, height: GREETING_CARD_H, overflow: 'hidden', fontFamily: CARD_FONT }, children);
}

function backgroundNodes(background: GreetingImage['background']): CardElement[] {
	if (background.dataUri) return [img(background.dataUri, { ...fill, objectFit: 'cover' })];
	const plan = greetingPresetBackgroundPlan(GREETING_CARD_W, GREETING_CARD_H, background.presetId);
	const { linear, glow } = plan;
	// converts the canvas gradient vector to a CSS angle with the same length and start corner
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

/** Wraps the layer in an outer box so animation multiplies with inner rotation/opacity/blur. */
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

function center(layer: { x: number; y: number }): { cx: number; cy: number } {
	return { cx: round((GREETING_CARD_W * layer.x) / 100), cy: round((GREETING_CARD_H * layer.y) / 100) };
}

function round(value: number): number {
	return Math.round(value * 100) / 100;
}

const DEFAULT_LINE_HEIGHT = 1.25;

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

function textAnchorOrigin(layer: GreetingTextLayer): string {
	const box = textBox(layer);
	return `${box.originX}px ${box.originY}px`;
}

function defaultTextShadow(size: number): string {
	return `0 2px ${Math.max(6, size / 4)}px rgba(0,0,0,0.45)`;
}

function shadowCss(shadow: GreetingShadow): string {
	return `${shadow.offsetX}px ${shadow.offsetY}px ${shadow.blur}px ${hexToRgba(shadow.color, shadow.opacity)}`;
}

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
			// Takumi ellipsizes overflow past the clipped box height
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
		// shapes measure 0° as left→right, CSS as up, hence +90
		style.backgroundImage = `linear-gradient(${(layer.gradient.angle ?? 0) + 90}deg, ${layer.color}, ${layer.gradient.to})`;
		style.backgroundClip = 'text';
		style.color = 'transparent';
	}
	return style;
}

function textNode(layer: GreetingTextLayer, vars: GreetingCardVars): CardElement {
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
			// explicit origin keeps the anchor fixed under left/right alignment
			...(layer.rotation ? { transform: `rotate(${layer.rotation}deg)`, transformOrigin: textAnchorOrigin(layer) } : {})
		},
		text ? h('div', textStyle(layer, box.width, box.wrap), text) : null
	);
}

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
