import { z } from 'zod';

import { type GifTiming, parseGifDataUriTiming } from './gifTiming.js';
import { CLASSIC_CENTER_LAYERS } from './memberGreetingTemplates.js';

export { GREETING_TEMPLATES, type GreetingTemplate } from './memberGreetingTemplates.js';

export const GREETING_CARD_W = 1200;
export const GREETING_CARD_H = 675;
export const GREETING_RENDER_SCALE = 2 / 3;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const SNOWFLAKE = /^\d{17,20}$/;
// Standard base64 alphabet only (not URL-safe).
const DATA_URI = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const BACKGROUND_DATA_URI = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;
const DATA_URI_MAX_LENGTH = 1_500_000;

export type GreetingTextLayer = {
	id: string;
	type: 'text';
	x: number;
	y: number;
	size: number;
	color: string;
	bold: boolean;
	align: 'left' | 'center' | 'right';
	text: string;
	rotation?: number;
	weight?: GreetingTextWeight;
	letterSpacing?: number;
	lineHeight?: number;
	maxWidth?: number;
	overflow?: GreetingTextOverflow;
	maxLines?: number;
	shadow?: GreetingShadow | null;
	stroke?: GreetingTextStroke | null;
	gradient?: GreetingTextGradient | null;
	animation?: GreetingAnimation;
	hidden?: boolean;
};

export const GREETING_TEXT_WEIGHTS = [400, 600, 700, 900] as const;
export type GreetingTextWeight = (typeof GREETING_TEXT_WEIGHTS)[number];

export const GREETING_TEXT_OVERFLOWS = ['wrap', 'ellipsis'] as const;
export type GreetingTextOverflow = (typeof GREETING_TEXT_OVERFLOWS)[number];

export type GreetingShadow = {
	color: string;
	opacity: number;
	blur: number;
	offsetX: number;
	offsetY: number;
};

export type GreetingTextStroke = { color: string; width: number };

export type GreetingTextGradient = { to: string; angle?: number };

export type GreetingAvatarLayer = {
	id: string;
	type: 'avatar';
	x: number;
	y: number;
	size: number;
	ringColor: string;
	shape?: GreetingAvatarShape;
	cornerRadius?: number;
	ringWidth?: number;
	shadow?: GreetingShadow | null;
	glow?: GreetingGlow | null;
	animation?: GreetingAnimation;
	hidden?: boolean;
};

export const GREETING_AVATAR_SHAPES = ['circle', 'rounded', 'square'] as const;
export type GreetingAvatarShape = (typeof GREETING_AVATAR_SHAPES)[number];

export type GreetingGlow = { color: string; opacity: number; blur: number; spread: number };

export type GreetingImageLayer = {
	id: string;
	type: 'image';
	x: number;
	y: number;
	width: number;
	height: number;
	dataUri: string;
	opacity: number;
	rotation?: number;
	animation?: GreetingAnimation;
	hidden?: boolean;
};

export const GREETING_ANIMATIONS = ['float', 'drift', 'sway', 'spin', 'pulse', 'twinkle'] as const;
export type GreetingAnimationKind = (typeof GREETING_ANIMATIONS)[number];

export type GreetingAnimation = {
	type: GreetingAnimationKind;
	durationMs: number;
	delayMs: number;
	intensity: number;
};

export const GREETING_ANIMATION_MAX_MS = 5000;
export const GREETING_ANIMATION_FPS = 20;

const greetingAnimationSchema = z.object({
	type: z.enum(GREETING_ANIMATIONS),
	durationMs: z.number().min(500).max(GREETING_ANIMATION_MAX_MS),
	delayMs: z.number().min(0).max(GREETING_ANIMATION_MAX_MS),
	intensity: z.number().min(0).max(1)
});

export const GREETING_SHAPES = ['rect', 'circle', 'triangle', 'diamond', 'hexagon', 'star', 'heart'] as const;
export type GreetingShapeKind = (typeof GREETING_SHAPES)[number];

export type GreetingShapeLayer = {
	id: string;
	type: 'shape';
	shape: GreetingShapeKind;
	x: number;
	y: number;
	width: number;
	height: number;
	color: string;
	opacity: number;
	rotation?: number;
	radius?: number;
	gradientTo?: string | null;
	gradientAngle?: number;
	strokeColor?: string | null;
	strokeWidth?: number;
	filled?: boolean;
	blur?: number;
	animation?: GreetingAnimation;
	hidden?: boolean;
};

export type GreetingLayer = GreetingTextLayer | GreetingAvatarLayer | GreetingImageLayer | GreetingShapeLayer;

export type GreetingImage = {
	background: { presetId: string | null; dataUri: string | null };
	layers: GreetingLayer[];
};

function backgroundGifTiming(image: GreetingImage): GifTiming | null {
	const timing = parseGifDataUriTiming(image.background.dataUri);
	return timing && timing.frames > 1 ? timing : null;
}

export function hasGreetingAnimation(image: GreetingImage): boolean {
	return backgroundGifTiming(image) !== null || image.layers.some((layer) => !layer.hidden && layer.animation !== undefined);
}

// Snaps animation loop to a multiple of GIF duration (capped at 5s) so WebP loops cleanly.
export function greetingAnimationDurationMs(image: GreetingImage): number {
	let layersMs = 0;
	for (const layer of image.layers) {
		if (layer.hidden || !layer.animation) continue;
		layersMs = Math.max(layersMs, layer.animation.durationMs);
	}
	const gif = backgroundGifTiming(image);
	if (!gif) return Math.min(layersMs, GREETING_ANIMATION_MAX_MS);
	if (gif.durationMs >= GREETING_ANIMATION_MAX_MS) return GREETING_ANIMATION_MAX_MS;
	const maxLoops = Math.floor(GREETING_ANIMATION_MAX_MS / gif.durationMs);
	const loops = Math.max(1, Math.min(maxLoops, Math.round(layersMs / gif.durationMs)));
	return gif.durationMs * loops;
}

export type GreetingLayout = 'container' | 'components';

export const GREETING_LAYOUTS = ['container', 'components'] as const;

export type GreetingConfig = {
	version: 2;
	enabled: boolean;
	channelId: string | null;
	template: string;
	useImage: boolean;
	image: GreetingImage | null;
	layout: GreetingLayout;
	accentColor: string | null;
};

export type GreetingKind = 'welcome' | 'goodbye';

const position = { x: z.number().min(0).max(100), y: z.number().min(0).max(100) };

const shadowSchema = z.object({
	color: z.string().regex(HEX_COLOR),
	opacity: z.number().min(0).max(1),
	blur: z.number().min(0).max(40),
	offsetX: z.number().min(-40).max(40),
	offsetY: z.number().min(-40).max(40)
});

const glowSchema = z.object({
	color: z.string().regex(HEX_COLOR),
	opacity: z.number().min(0).max(1),
	blur: z.number().min(0).max(80),
	spread: z.number().min(0).max(40)
});

const textLayerSchema = z.object({
	id: z.string().min(1).max(64),
	type: z.literal('text'),
	...position,
	size: z.number().min(12).max(160),
	color: z.string().regex(HEX_COLOR),
	bold: z.boolean(),
	align: z.enum(['left', 'center', 'right']),
	text: z.string().max(500),
	rotation: z.number().min(-180).max(180).optional(),
	weight: z.union([z.literal(400), z.literal(600), z.literal(700), z.literal(900)]).optional(),
	letterSpacing: z.number().min(-10).max(60).optional(),
	lineHeight: z.number().min(0.8).max(3).optional(),
	maxWidth: z.number().min(40).max(1200).optional(),
	overflow: z.enum(GREETING_TEXT_OVERFLOWS).optional(),
	maxLines: z.number().int().min(1).max(10).optional(),
	shadow: shadowSchema.nullable().optional(),
	stroke: z
		.object({ color: z.string().regex(HEX_COLOR), width: z.number().min(0).max(16) })
		.nullable()
		.optional(),
	gradient: z
		.object({ to: z.string().regex(HEX_COLOR), angle: z.number().min(0).max(360).optional() })
		.nullable()
		.optional(),
	animation: greetingAnimationSchema.optional(),
	hidden: z.boolean().optional()
});

const avatarLayerSchema = z.object({
	id: z.string().min(1).max(64),
	type: z.literal('avatar'),
	...position,
	size: z.number().min(40).max(600),
	ringColor: z.string().regex(HEX_COLOR),
	shape: z.enum(GREETING_AVATAR_SHAPES).optional(),
	cornerRadius: z.number().min(0).max(300).optional(),
	ringWidth: z.number().min(0).max(40).optional(),
	shadow: shadowSchema.nullable().optional(),
	glow: glowSchema.nullable().optional(),
	animation: greetingAnimationSchema.optional(),
	hidden: z.boolean().optional()
});

const imageLayerSchema = z.object({
	id: z.string().min(1).max(64),
	type: z.literal('image'),
	...position,
	width: z.number().min(1).max(1200),
	height: z.number().min(1).max(675),
	dataUri: z.string().regex(DATA_URI).max(DATA_URI_MAX_LENGTH),
	opacity: z.number().min(0).max(1),
	rotation: z.number().min(-180).max(180).optional(),
	animation: greetingAnimationSchema.optional(),
	hidden: z.boolean().optional()
});

const shapeLayerSchema = z.object({
	id: z.string().min(1).max(64),
	type: z.literal('shape'),
	shape: z.enum(GREETING_SHAPES),
	...position,
	width: z.number().min(1).max(1200),
	height: z.number().min(1).max(1200),
	color: z.string().regex(HEX_COLOR),
	opacity: z.number().min(0).max(1),
	rotation: z.number().min(-180).max(180).optional(),
	radius: z.number().min(0).max(600).optional(),
	gradientTo: z.string().regex(HEX_COLOR).nullable().optional(),
	gradientAngle: z.number().min(0).max(360).optional(),
	strokeColor: z.string().regex(HEX_COLOR).nullable().optional(),
	strokeWidth: z.number().min(0).max(40).optional(),
	filled: z.boolean().optional(),
	blur: z.number().min(0).max(120).optional(),
	animation: greetingAnimationSchema.optional(),
	hidden: z.boolean().optional()
});

const greetingLayerSchema = z.discriminatedUnion('type', [textLayerSchema, avatarLayerSchema, imageLayerSchema, shapeLayerSchema]);

const greetingImageSchema = z.object({
	background: z.strictObject({
		presetId: z
			.string()
			.refine((presetId) => PRESET_BACKGROUND_IDS.includes(presetId), { error: '알 수 없는 배경 프리셋' })
			.nullable(),
		dataUri: z.string().regex(BACKGROUND_DATA_URI).max(DATA_URI_MAX_LENGTH).nullable()
	}),
	layers: z.array(greetingLayerSchema).max(80)
});

export const greetingConfigSchema = z
	.object({
		version: z.literal(2),
		enabled: z.boolean(),
		channelId: z.string().regex(SNOWFLAKE).nullable(),
		template: z.string().max(500),
		useImage: z.boolean(),
		image: greetingImageSchema.nullable(),
		layout: z.enum(GREETING_LAYOUTS).default('container'),
		accentColor: z.string().regex(HEX_COLOR).nullable().default(null)
	})
	.refine((config) => (config.useImage ? config.image !== null : true), {
		error: 'useImage가 true일 때 image는 필수예요.'
	});

export function validateGreetingConfig(value: unknown): GreetingConfig | null {
	const result = greetingConfigSchema.safeParse(value);
	return result.success ? result.data : null;
}

export const DEFAULT_WELCOME_GREETING: GreetingConfig = {
	version: 2,
	enabled: false,
	channelId: null,
	template: '{유저}님이 입장했어요. 반가워요!',
	useImage: true,
	layout: 'container',
	accentColor: null,
	image: {
		background: { presetId: 'rose', dataUri: null },
		layers: structuredClone(CLASSIC_CENTER_LAYERS)
	}
};

export const DEFAULT_GOODBYE_GREETING: GreetingConfig = {
	version: 2,
	enabled: false,
	channelId: null,
	template: '{유저이름}님이 서버를 떠났어요.',
	useImage: true,
	layout: 'container',
	accentColor: null,
	image: {
		background: { presetId: 'rose', dataUri: null },
		layers: [
			{ id: 'avatar', type: 'avatar', x: 50, y: 20, size: 180, ringColor: '#ffffff' },
			{ id: 'title', type: 'text', x: 50, y: 44, size: 44, color: '#ffffff', bold: true, align: 'center', text: '잘 가요, {유저이름}' },
			{ id: 'subtitle', type: 'text', x: 50, y: 60, size: 24, color: '#ffffff', bold: false, align: 'center', text: '다음에 또 만나요' }
		]
	}
};

export const DEFAULT_GREETINGS: Record<GreetingKind, GreetingConfig> = {
	welcome: DEFAULT_WELCOME_GREETING,
	goodbye: DEFAULT_GOODBYE_GREETING
};

export type GreetingTemplateVariable = { token: string; description: string; usableInImage: boolean };

export const GREETING_TEMPLATE_VARIABLES: readonly GreetingTemplateVariable[] = [
	{ token: '{유저}', description: '멘션(@유저)으로 표시 (봇 메시지 전용, 이미지 카드에는 못 써요)', usableInImage: false },
	{ token: '{유저이름}', description: '멤버 표시 이름(닉네임)', usableInImage: true },
	{ token: '{서버}', description: '서버 이름', usableInImage: true },
	{ token: '{멤버수}', description: '서버 멤버 수', usableInImage: true }
];

export type PresetBackground = { id: string; name: string };

export const PRESET_BACKGROUNDS: readonly PresetBackground[] = [
	{ id: 'rose', name: '로즈' },
	{ id: 'plum', name: '플럼' },
	{ id: 'gold', name: '골드' },
	{ id: 'ocean', name: '오션' },
	{ id: 'mint', name: '민트' },
	{ id: 'sunset', name: '선셋' },
	{ id: 'lavender', name: '라벤더' },
	{ id: 'midnight', name: '미드나잇' },
	{ id: 'birthday', name: '생일' }
];

const PRESET_BACKGROUND_IDS: readonly string[] = PRESET_BACKGROUNDS.map((preset) => preset.id);

export function renderGreetingTemplate(
	template: string,
	vars: { mention?: string | null; displayName: string; guildName: string; memberCount: number }
): string {
	return template
		.replaceAll('{유저}', vars.mention ?? vars.displayName)
		.replaceAll('{유저이름}', vars.displayName)
		.replaceAll('{서버}', vars.guildName)
		.replaceAll('{멤버수}', String(vars.memberCount));
}
