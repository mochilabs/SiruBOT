import type {
	GreetingAnimation,
	GreetingAnimationKind,
	GreetingImage,
	GreetingLayer,
	GreetingShapeKind,
	GreetingShapeLayer,
	GreetingTextLayer
} from './memberGreeting.js';

export const CLASSIC_CENTER_LAYERS: GreetingLayer[] = [
	{ id: 'avatar', type: 'avatar', x: 50, y: 20, size: 180, ringColor: '#ffffff' },
	{ id: 'title', type: 'text', x: 50, y: 44, size: 44, color: '#ffffff', bold: true, align: 'center', text: '{유저이름} 님 반가워요!' },
	{ id: 'subtitle', type: 'text', x: 50, y: 60, size: 24, color: '#ffffff', bold: false, align: 'center', text: '{서버}의 {멤버수}번째 멤버' }
];

export type GreetingTemplate = {
	id: string;
	name: string;
	image: GreetingImage;
};

function shapeLayer(
	id: string,
	shape: GreetingShapeKind,
	x: number,
	y: number,
	size: number | [number, number],
	color: string,
	opacity: number,
	extra: Partial<GreetingShapeLayer> = {}
): GreetingShapeLayer {
	const [width, height] = typeof size === 'number' ? [size, size] : size;
	return { id, type: 'shape', shape, x, y, width, height, color, opacity, ...extra };
}

function textLayer(
	id: string,
	x: number,
	y: number,
	size: number,
	color: string,
	text: string,
	options: { bold?: boolean; align?: 'left' | 'center' | 'right'; rotation?: number } = {}
): GreetingTextLayer {
	return {
		id,
		type: 'text',
		x,
		y,
		size,
		color,
		bold: options.bold ?? false,
		align: options.align ?? 'center',
		text,
		...(options.rotation ? { rotation: options.rotation } : {})
	};
}

const CONFETTI: readonly [GreetingShapeKind, number, number, number, string, number][] = [
	['star', 8, 14, 46, '#fff0d6', 12],
	['triangle', 17, 30, 34, '#ffd166', -24],
	['circle', 6, 48, 22, '#ff6b8b', 0],
	['diamond', 14, 70, 36, '#fff0d6', 18],
	['star', 9, 88, 30, '#ffb36b', -10],
	['heart', 22, 86, 34, '#ff6b8b', 14],
	['triangle', 31, 12, 26, '#fff0d6', 30],
	['hexagon', 40, 90, 30, '#ffd166', 8],
	['circle', 60, 9, 20, '#fff0d6', 0],
	['star', 71, 16, 40, '#ffd166', 20],
	['diamond', 85, 10, 30, '#ff6b8b', -14],
	['heart', 92, 30, 38, '#fff0d6', -18],
	['triangle', 88, 52, 34, '#ffb36b', 24],
	['circle', 94, 72, 26, '#ff6b8b', 0],
	['star', 80, 88, 34, '#fff0d6', -8],
	['hexagon', 68, 92, 26, '#ffd166', 16]
];

const STARS: readonly [number, number, number, number, number][] = [
	[8, 12, 22, 0.9, 0],
	[18, 28, 14, 0.6, 12],
	[30, 10, 18, 0.8, -10],
	[44, 20, 12, 0.5, 0],
	[58, 8, 20, 0.85, 18],
	[70, 26, 12, 0.55, 0],
	[90, 14, 16, 0.7, -12],
	[12, 60, 12, 0.5, 0],
	[26, 78, 18, 0.7, 14],
	[40, 90, 12, 0.45, 0],
	[64, 84, 16, 0.65, -16],
	[78, 70, 12, 0.5, 0],
	[92, 86, 20, 0.8, 10],
	[6, 88, 14, 0.6, 0]
];

const STATIC_TEMPLATES: readonly GreetingTemplate[] = [
	{
		id: 'classic-center',
		name: '클래식 중앙',
		image: {
			background: { presetId: 'rose', dataUri: null },
			layers: structuredClone(CLASSIC_CENTER_LAYERS)
		}
	},
	{
		id: 'side-avatar',
		name: '좌측 아바타',
		image: {
			background: { presetId: 'plum', dataUri: null },
			layers: [
				{ id: 'avatar', type: 'avatar', x: 22, y: 50, size: 240, ringColor: '#ffb3d9' },
				{ id: 'title', type: 'text', x: 62, y: 40, size: 48, color: '#ffffff', bold: true, align: 'left', text: '{유저이름} 님 환영해요!' },
				{
					id: 'subtitle',
					type: 'text',
					x: 62,
					y: 58,
					size: 26,
					color: '#f0e2cf',
					bold: false,
					align: 'left',
					text: '{서버}의 {멤버수}번째 멤버'
				}
			]
		}
	},
	{
		id: 'minimal-band',
		name: '미니멀 밴드',
		image: {
			background: { presetId: 'gold', dataUri: null },
			layers: [
				{ id: 'band', type: 'shape', shape: 'rect', x: 50, y: 50, width: 1200, height: 220, color: '#231a10', opacity: 0.55 },
				{ id: 'avatar', type: 'avatar', x: 50, y: 20, size: 150, ringColor: '#d4a574' },
				{ id: 'title', type: 'text', x: 50, y: 52, size: 40, color: '#ffffff', bold: true, align: 'center', text: '{유저이름} 님 환영해요!' },
				{
					id: 'subtitle',
					type: 'text',
					x: 50,
					y: 66,
					size: 22,
					color: '#f0e2cf',
					bold: false,
					align: 'center',
					text: '{서버} · {멤버수}번째 멤버'
				}
			]
		}
	},
	{
		id: 'ocean-left-panel',
		name: '오션 사이드 패널',
		image: {
			background: { presetId: 'ocean', dataUri: null },
			layers: [
				{ id: 'panel', type: 'shape', shape: 'rect', x: 22, y: 50, width: 480, height: 675, color: '#07121c', opacity: 0.5 },
				{ id: 'avatar', type: 'avatar', x: 22, y: 42, size: 220, ringColor: '#d6f0ff' },
				{ id: 'name', type: 'text', x: 22, y: 72, size: 30, color: '#ffffff', bold: true, align: 'center', text: '{유저이름}' },
				{ id: 'title', type: 'text', x: 62, y: 42, size: 52, color: '#ffffff', bold: true, align: 'left', text: '어서 와요!' },
				{
					id: 'subtitle',
					type: 'text',
					x: 62,
					y: 60,
					size: 26,
					color: '#d6f0ff',
					bold: false,
					align: 'left',
					text: '{서버}에서 {멤버수}번째로 만났어요'
				}
			]
		}
	},
	{
		id: 'sunset-circle',
		name: '선셋 서클',
		image: {
			background: { presetId: 'sunset', dataUri: null },
			layers: [
				{ id: 'halo', type: 'shape', shape: 'circle', x: 50, y: 38, width: 360, height: 360, color: '#fff0d6', opacity: 0.25 },
				{ id: 'avatar', type: 'avatar', x: 50, y: 38, size: 240, ringColor: '#fff0d6' },
				{ id: 'title', type: 'text', x: 50, y: 70, size: 46, color: '#ffffff', bold: true, align: 'center', text: '{유저이름} 님 환영해요!' },
				{
					id: 'subtitle',
					type: 'text',
					x: 50,
					y: 84,
					size: 24,
					color: '#fff0d6',
					bold: false,
					align: 'center',
					text: '{서버} · {멤버수}번째 멤버'
				}
			]
		}
	},
	{
		id: 'mint-ribbon',
		name: '민트 리본',
		image: {
			background: { presetId: 'mint', dataUri: null },
			layers: [
				{ id: 'ribbon', type: 'shape', shape: 'rect', x: 50, y: 80, width: 1200, height: 150, color: '#0a1a15', opacity: 0.6 },
				{ id: 'avatar', type: 'avatar', x: 50, y: 34, size: 200, ringColor: '#e0fff2' },
				{ id: 'title', type: 'text', x: 50, y: 77, size: 40, color: '#ffffff', bold: true, align: 'center', text: '{유저이름} 님, 반가워요' },
				{
					id: 'subtitle',
					type: 'text',
					x: 50,
					y: 89,
					size: 22,
					color: '#e0fff2',
					bold: false,
					align: 'center',
					text: '{서버}의 {멤버수}번째 멤버'
				}
			]
		}
	},
	{
		id: 'lavender-right',
		name: '라벤더 우측 아바타',
		image: {
			background: { presetId: 'lavender', dataUri: null },
			layers: [
				{ id: 'title', type: 'text', x: 8, y: 38, size: 54, color: '#ffffff', bold: true, align: 'left', text: '환영해요,' },
				{ id: 'name', type: 'text', x: 8, y: 56, size: 44, color: '#efe8ff', bold: true, align: 'left', text: '{유저이름} 님' },
				{
					id: 'subtitle',
					type: 'text',
					x: 8,
					y: 74,
					size: 24,
					color: '#efe8ff',
					bold: false,
					align: 'left',
					text: '{서버} · {멤버수}번째 멤버'
				},
				{ id: 'avatar', type: 'avatar', x: 78, y: 50, size: 260, ringColor: '#efe8ff' }
			]
		}
	},
	{
		id: 'midnight-quiet',
		name: '미드나잇 심플',
		image: {
			background: { presetId: 'midnight', dataUri: null },
			layers: [
				{ id: 'avatar', type: 'avatar', x: 50, y: 28, size: 160, ringColor: '#9db4ff' },
				{ id: 'title', type: 'text', x: 50, y: 56, size: 38, color: '#ffffff', bold: true, align: 'center', text: '{유저이름}' },
				{ id: 'line', type: 'shape', shape: 'rect', x: 50, y: 66, width: 120, height: 3, color: '#9db4ff', opacity: 0.9 },
				{
					id: 'subtitle',
					type: 'text',
					x: 50,
					y: 76,
					size: 22,
					color: '#9db4ff',
					bold: false,
					align: 'center',
					text: '{서버}에 오신 것을 환영해요'
				}
			]
		}
	},
	{
		id: 'plum-double-ring',
		name: '플럼 더블 링',
		image: {
			background: { presetId: 'plum', dataUri: null },
			layers: [
				{ id: 'ring', type: 'shape', shape: 'circle', x: 50, y: 38, width: 330, height: 330, color: '#ffb3d9', opacity: 0.22 },
				{ id: 'avatar', type: 'avatar', x: 50, y: 38, size: 230, ringColor: '#ffb3d9' },
				{ id: 'title', type: 'text', x: 50, y: 72, size: 44, color: '#ffffff', bold: true, align: 'center', text: '{유저이름} 님 반가워요!' },
				{
					id: 'subtitle',
					type: 'text',
					x: 50,
					y: 86,
					size: 24,
					color: '#ffb3d9',
					bold: false,
					align: 'center',
					text: '{멤버수}번째 멤버가 되었어요'
				}
			]
		}
	},
	{
		id: 'aurora-glass',
		name: '오로라 글라스',
		image: {
			background: { presetId: 'midnight', dataUri: null },
			layers: [
				shapeLayer('glow-violet', 'circle', 18, 22, [560, 380], '#6a4fb0', 0.6, { blur: 80 }),
				shapeLayer('glow-pink', 'circle', 84, 80, [600, 400], '#ff85c1', 0.42, { blur: 90 }),
				shapeLayer('glow-mint', 'circle', 62, 14, [320, 220], '#7fd6b0', 0.32, { blur: 70 }),
				shapeLayer('glass', 'rect', 50, 50, [1010, 440], '#ffffff', 0.09, { radius: 52 }),
				shapeLayer('glass-edge', 'rect', 50, 50, [1010, 440], '#ffffff', 0.38, {
					radius: 52,
					filled: false,
					strokeColor: '#ffffff',
					strokeWidth: 2
				}),
				shapeLayer('avatar-halo', 'circle', 27, 50, 292, '#ffffff', 0.9, { filled: false, strokeColor: '#b9a3ff', strokeWidth: 3 }),
				{ id: 'avatar', type: 'avatar', x: 27, y: 50, size: 232, ringColor: '#ffffff' },
				shapeLayer('pill', 'rect', 71.75, 30, [210, 46], '#ff85c1', 0.95, { radius: 23, gradientTo: '#b9a3ff', gradientAngle: 0 }),
				textLayer('pill-text', 71.75, 30, 22, '#ffffff', 'WELCOME', { bold: true }),
				textLayer('title', 63, 48, 54, '#ffffff', '{유저이름}', { bold: true, align: 'left' }),
				textLayer('subtitle', 63, 63, 26, '#d9ccff', '{서버}에 오신 걸 환영해요', { align: 'left' }),
				textLayer('count', 63, 74, 22, '#9db4ff', '{멤버수}번째 멤버', { align: 'left' })
			]
		}
	},
	{
		id: 'confetti-party',
		name: '컨페티 파티',
		image: {
			background: { presetId: 'sunset', dataUri: null },
			layers: [
				shapeLayer('burst', 'circle', 50, 36, 470, '#fff0d6', 0.3, { blur: 50 }),
				...CONFETTI.map(([shape, x, y, size, color, rotation], i) =>
					shapeLayer(`confetti-${i}`, shape, x, y, size, color, 0.9, { rotation })
				),
				shapeLayer('ring', 'circle', 50, 36, 330, '#fff0d6', 0.85, { filled: false, strokeColor: '#fff0d6', strokeWidth: 4 }),
				{ id: 'avatar', type: 'avatar', x: 50, y: 36, size: 250, ringColor: '#fff0d6' },
				shapeLayer('banner', 'rect', 50, 74, [820, 96], '#2a1410', 0.5, { radius: 48 }),
				textLayer('title', 50, 74, 48, '#ffffff', '🎉 {유저이름} 님 환영해요!', { bold: true }),
				textLayer('subtitle', 50, 90, 24, '#fff0d6', '{서버} · {멤버수}번째 멤버')
			]
		}
	},
	{
		id: 'hex-tech',
		name: '헥스 테크',
		image: {
			background: { presetId: 'ocean', dataUri: null },
			layers: [
				shapeLayer('hex-big', 'hexagon', 90, 16, 420, '#d6f0ff', 0.22, {
					filled: false,
					strokeColor: '#d6f0ff',
					strokeWidth: 3,
					rotation: 12
				}),
				shapeLayer('hex-fill', 'hexagon', 94, 88, 300, '#5fb0d9', 0.4, { gradientTo: '#1f4f73', gradientAngle: 90, rotation: -8 }),
				shapeLayer('hex-small', 'hexagon', 70, 90, 90, '#d6f0ff', 0.5, { rotation: 20 }),
				shapeLayer('bar-a', 'rect', 79.8, 24, [380, 6], '#d6f0ff', 0.7, { radius: 3 }),
				shapeLayer('bar-b', 'rect', 70.25, 24, [150, 6], '#5fb0d9', 0.9, { radius: 3 }),
				shapeLayer('frame-outer', 'hexagon', 24, 50, 420, '#5fb0d9', 0.35, { filled: false, strokeColor: '#5fb0d9', strokeWidth: 3 }),
				shapeLayer('frame-inner', 'hexagon', 24, 50, 360, '#d6f0ff', 1, { filled: false, strokeColor: '#d6f0ff', strokeWidth: 8 }),
				{ id: 'avatar', type: 'avatar', x: 24, y: 50, size: 224, ringColor: '#d6f0ff' },
				textLayer('tag', 64, 34, 22, '#5fb0d9', 'NEW MEMBER', { bold: true, align: 'left' }),
				textLayer('title', 64, 48, 58, '#ffffff', '{유저이름}', { bold: true, align: 'left' }),
				shapeLayer('divider', 'rect', 76.5, 60, [300, 4], '#d6f0ff', 0.8, { radius: 2 }),
				textLayer('subtitle', 64, 70, 26, '#d6f0ff', '{서버}의 {멤버수}번째 멤버', { align: 'left' })
			]
		}
	},
	{
		id: 'heart-bloom',
		name: '하트 블룸',
		image: {
			background: { presetId: 'rose', dataUri: null },
			layers: [
				shapeLayer('heart-glow', 'heart', 50, 42, [560, 520], '#ffe4f0', 0.4, { blur: 50 }),
				shapeLayer('heart-back', 'heart', 50, 42, [470, 430], '#ffffff', 0.18, { rotation: -8, gradientTo: '#ff85c1', gradientAngle: 90 }),
				shapeLayer('heart-l', 'heart', 12, 22, 110, '#ffe4f0', 0.9, { rotation: -18 }),
				shapeLayer('heart-r', 'heart', 89, 28, 140, '#ffffff', 0.85, { rotation: 16, gradientTo: '#ffb3d9', gradientAngle: 90 }),
				shapeLayer('heart-s1', 'heart', 22, 72, 64, '#ffffff', 0.8, { rotation: 12 }),
				shapeLayer('heart-s2', 'heart', 80, 78, 80, '#ffe4f0', 0.85, { rotation: -14 }),
				shapeLayer('heart-s3', 'heart', 6, 56, 40, '#ffffff', 0.7, { rotation: 20 }),
				shapeLayer('heart-s4', 'heart', 94, 58, 44, '#ffffff', 0.7, { rotation: -22 }),
				shapeLayer('spark-a', 'star', 33, 14, 34, '#ffffff', 0.9),
				shapeLayer('spark-b', 'star', 68, 10, 24, '#fff0f6', 0.8, { rotation: 15 }),
				{ id: 'avatar', type: 'avatar', x: 50, y: 38, size: 236, ringColor: '#ffffff' },
				textLayer('title', 50, 72, 50, '#ffffff', '{유저이름} 님 반가워요 ♥', { bold: true }),
				textLayer('subtitle', 50, 86, 26, '#ffe4f0', '{서버}의 {멤버수}번째 멤버')
			]
		}
	},
	{
		id: 'diagonal-split',
		name: '다이애고널 스플릿',
		image: {
			background: { presetId: 'lavender', dataUri: null },
			layers: [
				shapeLayer('slab', 'rect', 24, 50, [640, 1100], '#0c0820', 0.62, { rotation: 14 }),
				shapeLayer('slab-edge', 'rect', 40, 50, [14, 1100], '#ffffff', 0.85, { rotation: 14, gradientTo: '#b9a3ff', gradientAngle: 90 }),
				shapeLayer('slab-edge2', 'rect', 44.5, 50, [5, 1100], '#ffffff', 0.4, { rotation: 14 }),
				shapeLayer('tri', 'triangle', 90, 84, 190, '#efe8ff', 0.28, { rotation: 12 }),
				shapeLayer('tri2', 'triangle', 76, 92, 90, '#ffffff', 0.5, { rotation: -20 }),
				shapeLayer('circle-a', 'circle', 86, 18, 120, '#ffffff', 0.9, { filled: false, strokeColor: '#efe8ff', strokeWidth: 5 }),
				shapeLayer('circle-b', 'circle', 86, 18, 54, '#efe8ff', 0.8),
				{ id: 'avatar', type: 'avatar', x: 20, y: 50, size: 250, ringColor: '#efe8ff' },
				textLayer('title', 66, 40, 56, '#ffffff', '환영해요,', { bold: true, align: 'left' }),
				textLayer('name', 66, 56, 52, '#2a1f5c', '{유저이름} 님', { bold: true, align: 'left' }),
				textLayer('subtitle', 66, 72, 26, '#efe8ff', '{서버} · {멤버수}번째 멤버', { align: 'left' })
			]
		}
	},
	{
		id: 'starry-night',
		name: '별이 빛나는 밤',
		image: {
			background: { presetId: 'midnight', dataUri: null },
			layers: [
				shapeLayer('nebula', 'circle', 50, 100, [1100, 360], '#6a4fb0', 0.45, { blur: 90 }),
				shapeLayer('nebula-2', 'circle', 16, 8, [420, 260], '#2b3a5c', 0.8, { blur: 70 }),
				...STARS.map(([x, y, size, opacity, rotation], i) => shapeLayer(`star-${i}`, 'star', x, y, size, '#ffffff', opacity, { rotation })),
				shapeLayer('moon-glow', 'circle', 82, 22, 220, '#f0e2cf', 0.35, { blur: 40 }),
				shapeLayer('moon', 'circle', 82, 22, 130, '#f0e2cf', 1, { gradientTo: '#d4a574', gradientAngle: 45 }),
				shapeLayer('crater-a', 'circle', 79.5, 20, 26, '#b08a5a', 0.35),
				shapeLayer('crater-b', 'circle', 84, 26, 18, '#b08a5a', 0.3),
				shapeLayer('crater-c', 'circle', 85.5, 17.5, 12, '#b08a5a', 0.3),
				shapeLayer('hill-back', 'circle', 16, 100, [900, 300], '#10172a', 1),
				shapeLayer('hill-front', 'circle', 88, 100, [900, 260], '#0a0f1c', 1),
				{ id: 'avatar', type: 'avatar', x: 50, y: 34, size: 200, ringColor: '#9db4ff' },
				shapeLayer('ring', 'circle', 50, 34, 266, '#9db4ff', 0.5, { filled: false, strokeColor: '#9db4ff', strokeWidth: 2 }),
				textLayer('title', 50, 66, 48, '#ffffff', '{유저이름} 님, 반가워요', { bold: true }),
				shapeLayer('divider', 'diamond', 50, 76, 16, '#9db4ff', 1),
				shapeLayer('divider-l', 'rect', 41, 76, [160, 2], '#9db4ff', 0.6),
				shapeLayer('divider-r', 'rect', 59, 76, [160, 2], '#9db4ff', 0.6),
				textLayer('subtitle', 50, 86, 24, '#9db4ff', '{서버}의 {멤버수}번째 별이 되었어요')
			]
		}
	}
];

type AnimationRule = (index: number) => GreetingAnimation;
const anim = (type: GreetingAnimationKind, durationMs: number, delayMs = 0, intensity = 0.5): GreetingAnimation => ({
	type,
	durationMs,
	delayMs,
	intensity
});

const TEMPLATE_ANIMATIONS: Record<string, Record<string, AnimationRule>> = {
	'aurora-glass': {
		'glow-violet': () => anim('drift', 4000, 0, 0.7),
		'glow-pink': () => anim('drift', 4000, 2000, 0.8),
		'glow-mint': () => anim('float', 4000, 1000, 0.6),
		'avatar-halo': () => anim('pulse', 2000, 0, 0.4)
	},
	'confetti-party': {
		burst: () => anim('pulse', 4000, 0, 0.5),
		confetti: (i) => (i % 2 === 0 ? anim('spin', 4000, (i * 250) % 4000) : anim('sway', 2000, (i * 300) % 2000, 0.8)),
		ring: () => anim('pulse', 2000, 0, 0.3)
	},
	'starry-night': {
		nebula: () => anim('drift', 4000, 0, 0.4),
		'star-': (i) => anim('twinkle', i % 3 === 0 ? 4000 : 2000, (i * 370) % 2000, 0.6),
		'moon-glow': () => anim('pulse', 4000, 0, 0.5)
	},
	'heart-bloom': {
		'heart-back': () => anim('pulse', 2000, 0, 0.4),
		'heart-l': () => anim('float', 4000, 0, 0.6),
		'heart-r': () => anim('float', 4000, 1500, 0.7),
		'heart-s': (i) => anim('float', 2000, i * 450, 0.8),
		'spark-': (i) => anim('twinkle', 2000, i * 700, 0.7)
	}
};

function withTemplateAnimations(template: GreetingTemplate): GreetingTemplate {
	const rules = TEMPLATE_ANIMATIONS[template.id];
	if (!rules) return template;
	const counters = new Map<string, number>();
	const layers = template.image.layers.map((layer) => {
		const prefix = Object.keys(rules).find((key) => layer.id.startsWith(key));
		if (!prefix) return layer;
		const index = counters.get(prefix) ?? 0;
		counters.set(prefix, index + 1);
		return { ...layer, animation: rules[prefix]!(index) } as GreetingLayer;
	});
	return { ...template, image: { ...template.image, layers } };
}

export const GREETING_TEMPLATES: readonly GreetingTemplate[] = STATIC_TEMPLATES.map(withTemplateAnimations);
