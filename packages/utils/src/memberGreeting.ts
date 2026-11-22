import { z } from 'zod';

/**
 * 멤버 인사(환영/작별) 공용 계약 v2 — bot 리스너, data-api 렌더러, dashboard 에디터가 함께 쓴다.
 * Prisma Guild.welcome / goodbye 컬럼(Json?)에 이 구조 그대로 저장한다.
 *
 * v2 변경점: 고정 레이아웃(배경+아바타+제목/부제) → 자유 레이어 배열(image.layers)로 진화.
 * 아바타·제목·부제는 이제 각각 레이어 한 개이고, 텍스트/아바타/이미지/도형을 순서대로 쌓는다.
 * 이후 추가: layout(컨테이너/컴포넌트 목록)과 accentColor(컨테이너 강조색) — 둘 다 기본값이 있어
 * 예전에 저장된 v2 값도 그대로 검증을 통과한다.
 * 템플릿 변수: {유저} {유저이름} {서버} {멤버수} — GREETING_TEMPLATE_VARIABLES 참고.
 */

/**
 * 카드 논리 좌표계 — 렌더러/에디터 미러 공용 계약 (1200×675, 16:9 기준 캔버스).
 * x/y는 카드 너비·높이 대비 %(0~100), 중앙 앵커(요소 중심이 그 점에 놓인다).
 * size/width/height는 카드 실좌표(1200×675) 기준 px.
 */
export const GREETING_CARD_W = 1200;
export const GREETING_CARD_H = 675;
/**
 * 출력 PNG 축소 배율 — 저장 좌표계는 1200×675를 그대로 두고, 렌더 출력 PNG만 800×450로 균일 축소한다.
 * 레이어 x/y가 % 기반이라 저장 데이터 마이그레이션·재그리기가 필요 없다. 카드 크기 튜닝용 상수.
 */
export const GREETING_RENDER_SCALE = 2 / 3;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const SNOWFLAKE = /^\d{17,20}$/;
// jpeg 표기 허용 (image/jpeg). base64 본문은 URL-safe가 아닌 표준 알파벳만 허용.
const DATA_URI = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const DATA_URI_MAX_LENGTH = 1_500_000; // prefix 포함 문자 길이 ≈ 1.1MB 바이너리 상한

/** 텍스트 레이어 — 템플릿 변수를 포함할 수 있는 문자열 1개 */
export type GreetingTextLayer = {
	id: string;
	type: 'text';
	x: number;
	y: number;
	size: number; // 폰트 px
	color: string;
	bold: boolean;
	align: 'left' | 'center' | 'right';
	text: string;
	/** 회전(도, 시계 방향) — 텍스트 기준점(x, y) 중심. 기본 0 */
	rotation?: number;
	/** 숨김 레이어 — 렌더러가 건너뛴다 (에디터 보임/숨김 토글이 저장돼요) */
	hidden?: boolean;
};

/** 아바타 레이어 — 멤버 아바타(원형 + 링) */
export type GreetingAvatarLayer = {
	id: string;
	type: 'avatar';
	x: number;
	y: number;
	size: number; // 지름 px
	ringColor: string;
	hidden?: boolean;
};

/** 이미지 레이어 — 사용자 업로드 스티커/로고 (dataURI) */
export type GreetingImageLayer = {
	id: string;
	type: 'image';
	x: number;
	y: number;
	width: number;
	height: number;
	dataUri: string;
	opacity: number; // 0~1
	/** 회전(도, 시계 방향) — 이미지 중심 기준. 기본 0 */
	rotation?: number;
	hidden?: boolean;
};

/** 도형 종류 — 렌더러가 SVG로 그려요 */
export const GREETING_SHAPES = ['rect', 'circle', 'triangle', 'diamond', 'hexagon', 'star', 'heart'] as const;
export type GreetingShapeKind = (typeof GREETING_SHAPES)[number];

/**
 * 도형 레이어 — 장식용 도형. 필수 필드(shape·x·y·width·height·color·opacity)만으로 예전처럼 단색 도형이 되고,
 * 선택 필드로 회전·모서리 둥글기·그라디언트·테두리·윤곽선만 그리기·흐림(글로우)을 더할 수 있어요 (전부 생략 가능 — 하위 호환).
 */
export type GreetingShapeLayer = {
	id: string;
	type: 'shape';
	shape: GreetingShapeKind;
	x: number;
	y: number;
	width: number;
	height: number;
	color: string;
	opacity: number; // 0~1
	/** 회전(도, 시계 방향) — 도형 중심 기준. 기본 0 */
	rotation?: number;
	/** 사각형 모서리 둥글기 px — shape가 rect일 때만 써요. 기본 0 */
	radius?: number;
	/** 그라디언트 끝색 — 있으면 color → gradientTo로 칠해요 */
	gradientTo?: string | null;
	/** 그라디언트 각도(도, 0 = 왼→오른, 90 = 위→아래, 시계 방향). 기본 45(좌상→우하) */
	gradientAngle?: number;
	/** 테두리 색 — strokeWidth가 0보다 클 때만 그려요 */
	strokeColor?: string | null;
	/** 테두리 두께 px. 기본 0 */
	strokeWidth?: number;
	/** false면 안쪽을 비우고 테두리만 그려요. 기본 true */
	filled?: boolean;
	/** 흐림 반경 px — 글로우·빛 번짐 장식용. 기본 0 */
	blur?: number;
	hidden?: boolean;
};

export type GreetingLayer = GreetingTextLayer | GreetingAvatarLayer | GreetingImageLayer | GreetingShapeLayer;

/** 인사 카드 이미지 설정 — 배경(프리셋 또는 업로드) + 위에 쌓는 레이어 배열(순서 = z-order) */
export type GreetingImage = {
	background: { presetId: string | null; dataUri: string | null };
	layers: GreetingLayer[];
};

/**
 * 메시지 레이아웃 — Discord에 보내는 최상위 구조를 선택해요.
 * 'container'는 컨테이너 1개에 담아 보내는 방식이고, 'components'는 컨테이너 없이
 * 컴포넌트 목록(TextDisplay·Separator·Section·MediaGallery)을 그대로 보내는 방식이에요.
 * 강조색(accent color)은 컨테이너 전용 속성이라 'components'에서는 쓸 수 없어요.
 */
export type GreetingLayout = 'container' | 'components';

export const GREETING_LAYOUTS = ['container', 'components'] as const;

/** Guild.welcome / goodbye에 저장되는 값. version은 스키마 진화용 리터럴. */
export type GreetingConfig = {
	version: 2;
	enabled: boolean;
	channelId: string | null; // 대상 텍스트 채널
	template: string; // 봇 메시지 본문. 변수: {유저} {유저이름} {서버} {멤버수}
	useImage: boolean;
	image: GreetingImage | null; // useImage가 true일 때만 유효
	/** 메시지 레이아웃 — 기본 'container' */
	layout: GreetingLayout;
	/** 컨테이너 강조색(#RRGGBB) — null이면 봇 기본색. layout이 'components'면 무시돼요 */
	accentColor: string | null;
};

/** 인사 종류 — Guild 컬럼 이름(welcome/goodbye)과 렌더러 분기에 모두 쓴다 */
export type GreetingKind = 'welcome' | 'goodbye';

// zod 스키마
const position = { x: z.number().min(0).max(100), y: z.number().min(0).max(100) };

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
	hidden: z.boolean().optional()
});

const avatarLayerSchema = z.object({
	id: z.string().min(1).max(64),
	type: z.literal('avatar'),
	...position,
	size: z.number().min(40).max(600),
	ringColor: z.string().regex(HEX_COLOR),
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
	hidden: z.boolean().optional()
});

const greetingLayerSchema = z.discriminatedUnion('type', [textLayerSchema, avatarLayerSchema, imageLayerSchema, shapeLayerSchema]);

// presetId는 프리셋 목록(id + 이름) 안에서만 유효 — 렌더러가 프리셋을 코드로 직접 그리기 때문.
const greetingImageSchema = z.object({
	background: z.strictObject({
		presetId: z
			.string()
			.refine((presetId) => PRESET_BACKGROUND_IDS.includes(presetId), { error: '알 수 없는 배경 프리셋' })
			.nullable(),
		dataUri: z.string().regex(DATA_URI).max(DATA_URI_MAX_LENGTH).nullable()
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
		// layout·accentColor는 뒤에 추가된 필드예요 — 저장된 v2 값에 없으면 기본값을 채워 하위 호환을 지켜요.
		layout: z.enum(GREETING_LAYOUTS).default('container'),
		accentColor: z.string().regex(HEX_COLOR).nullable().default(null)
	})
	.refine((config) => (config.useImage ? config.image !== null : true), {
		error: 'useImage가 true일 때 image는 필수예요.'
	});

/** Prisma Json? 컬럼에서 읽은 값 검증 — 유효하면 타입 있는 설정, 아니면 null (호출부는 기본값으로 폴백). */
export function validateGreetingConfig(value: unknown): GreetingConfig | null {
	const result = greetingConfigSchema.safeParse(value);
	return result.success ? result.data : null;
}

// 기본값 (v2)
/** classic-center 카드의 기본 레이어 3종, 기본 환영 설정과 프리셋이 같은 데이터를 써요 */
const CLASSIC_CENTER_LAYERS: GreetingLayer[] = [
	{ id: 'avatar', type: 'avatar', x: 50, y: 20, size: 180, ringColor: '#ffffff' },
	{ id: 'title', type: 'text', x: 50, y: 44, size: 44, color: '#ffffff', bold: true, align: 'center', text: '{유저이름} 님 반가워요!' },
	{ id: 'subtitle', type: 'text', x: 50, y: 60, size: 24, color: '#ffffff', bold: false, align: 'center', text: '{서버}의 {멤버수}번째 멤버' }
];

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

// 카드 템플릿 (프리셋 레이아웃)
/** 완성형 카드 디자인 프리셋 — 에디터가 골라 시작한 뒤 자유 수정한다. */
export type GreetingTemplate = {
	id: string;
	name: string;
	image: GreetingImage;
};

/** 템플릿 데이터를 짧게 쓰기 위한 도형 레이어 생성 헬퍼 — 저장되는 값은 일반 GreetingShapeLayer 그대로예요. */
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

/** 텍스트 레이어 생성 헬퍼 */
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

/** 컨페티 조각 — [종류, x%, y%, 크기, 색, 회전] */
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

/** 별밤 — [x%, y%, 크기, 불투명도, 회전] */
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

export const GREETING_TEMPLATES: readonly GreetingTemplate[] = [
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

/** 템플릿 변수 메타데이터 — dashboard 에디터의 변수 삽입 칩과 bot 치환기가 함께 참조 */
export type GreetingTemplateVariable = { token: string; description: string; usableInImage: boolean };

export const GREETING_TEMPLATE_VARIABLES: readonly GreetingTemplateVariable[] = [
	{ token: '{유저}', description: '멘션(@유저)으로 표시 (봇 메시지 전용, 이미지 카드에는 못 써요)', usableInImage: false },
	{ token: '{유저이름}', description: '멤버 표시 이름(닉네임)', usableInImage: true },
	{ token: '{서버}', description: '서버 이름', usableInImage: true },
	{ token: '{멤버수}', description: '서버 멤버 수', usableInImage: true }
];

/** 커스텀 배경 프리셋 — 렌더러가 코드로 그린다 (아이디+이름 메타데이터) */
export type PresetBackground = { id: string; name: string };

export const PRESET_BACKGROUNDS: readonly PresetBackground[] = [
	{ id: 'rose', name: '로즈' },
	{ id: 'plum', name: '플럼' },
	{ id: 'gold', name: '골드' },
	{ id: 'ocean', name: '오션' },
	{ id: 'mint', name: '민트' },
	{ id: 'sunset', name: '선셋' },
	{ id: 'lavender', name: '라벤더' },
	{ id: 'midnight', name: '미드나잇' }
];

const PRESET_BACKGROUND_IDS: readonly string[] = PRESET_BACKGROUNDS.map((preset) => preset.id);

/**
 * 템플릿 치환기 — 봇 메시지와 이미지 카드 텍스트가 같은 토큰 체계를 공유해요.
 * {유저}는 봇 메시지에서만 멘션으로 치환되고, 이미지 렌더러는 멘션을 못 그리니
 * 표시 이름으로 폴백해요 (GREETING_TEMPLATE_VARIABLES.usableInImage 기준).
 */
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
