import { z } from 'zod';

/**
 * 멤버 인사(환영/작별) 공용 계약 v2 — bot 리스너, data-api 렌더러, dashboard 에디터가 함께 쓴다.
 * Prisma Guild.welcome / goodbye 컬럼(Json?)에 이 구조 그대로 저장한다.
 *
 * v2 변경점: 고정 레이아웃(배경+아바타+제목/부제) → 자유 레이어 배열(image.layers)로 진화.
 * 아바타·제목·부제는 이제 각각 레이어 한 개이고, 텍스트/아바타/이미지/도형을 순서대로 쌓는다.
 * 템플릿 변수: {유저} {유저이름} {서버} {멤버수} — GREETING_TEMPLATE_VARIABLES 참고.
 */

// --- 공용 상수 ---
/** 카드 논리 좌표계 — 렌더러/에디터 미러가 함께 쓰는 1200×675(16:9) 기준 캔버스 */
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

/**
 * 카드 기준 좌표계 — 렌더러/에디터 미러 공용 계약.
 * x/y는 카드 너비·높이 대비 %(0~100), **중앙 앵커**(요소 중심이 그 점에 놓인다).
 * size/width/height는 카드 실좌표(1200×675) 기준 px.
 */

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
	hidden?: boolean;
};

/** 도형 레이어 — 장식용 사각형/원 */
export type GreetingShapeLayer = {
	id: string;
	type: 'shape';
	shape: 'rect' | 'circle';
	x: number;
	y: number;
	width: number;
	height: number;
	color: string;
	opacity: number; // 0~1
	hidden?: boolean;
};

export type GreetingLayer = GreetingTextLayer | GreetingAvatarLayer | GreetingImageLayer | GreetingShapeLayer;

/** 인사 카드 이미지 설정 — 배경(프리셋 또는 업로드) + 위에 쌓는 레이어 배열(순서 = z-order) */
export type GreetingImage = {
	background: { presetId: string | null; dataUri: string | null };
	layers: GreetingLayer[];
};

/** Guild.welcome / goodbye에 저장되는 값. version은 스키마 진화용 리터럴. */
export type GreetingConfig = {
	version: 2;
	enabled: boolean;
	channelId: string | null; // 대상 텍스트 채널
	template: string; // 봇 메시지 본문. 변수: {유저} {유저이름} {서버} {멤버수}
	useImage: boolean;
	image: GreetingImage | null; // useImage가 true일 때만 유효
};

/** 인사 종류 — Guild 컬럼 이름(welcome/goodbye)과 렌더러 분기에 모두 쓴다 */
export type GreetingKind = 'welcome' | 'goodbye';

// --- zod 스키마 ---
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
	hidden: z.boolean().optional()
});

const shapeLayerSchema = z.object({
	id: z.string().min(1).max(64),
	type: z.literal('shape'),
	shape: z.enum(['rect', 'circle']),
	...position,
	width: z.number().min(1).max(1200),
	height: z.number().min(1).max(675),
	color: z.string().regex(HEX_COLOR),
	opacity: z.number().min(0).max(1),
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
	layers: z.array(greetingLayerSchema).max(50)
});

export const greetingConfigSchema = z
	.object({
		version: z.literal(2),
		enabled: z.boolean(),
		channelId: z.string().regex(SNOWFLAKE).nullable(),
		template: z.string().max(500),
		useImage: z.boolean(),
		image: greetingImageSchema.nullable()
	})
	.refine((config) => (config.useImage ? config.image !== null : true), {
		error: 'useImage가 true일 때 image는 필수예요.'
	});

/** Prisma Json? 컬럼에서 읽은 값 검증 — 유효하면 타입 있는 설정, 아니면 null (호출부는 기본값으로 폴백). */
export function validateGreetingConfig(value: unknown): GreetingConfig | null {
	const result = greetingConfigSchema.safeParse(value);
	return result.success ? result.data : null;
}

// --- 기본값 (v2) ---
export const DEFAULT_WELCOME_GREETING: GreetingConfig = {
	version: 2,
	enabled: false,
	channelId: null,
	template: '{유저}님이 입장했어요. 반가워요!',
	useImage: true,
	image: {
		background: { presetId: 'rose', dataUri: null },
		layers: [
			{ id: 'avatar', type: 'avatar', x: 50, y: 20, size: 180, ringColor: '#ffffff' },
			{ id: 'title', type: 'text', x: 50, y: 44, size: 44, color: '#ffffff', bold: true, align: 'center', text: '{유저이름} 님 반가워요!' },
			{
				id: 'subtitle',
				type: 'text',
				x: 50,
				y: 60,
				size: 24,
				color: '#ffffff',
				bold: false,
				align: 'center',
				text: '{서버}의 {멤버수}번째 멤버'
			}
		]
	}
};

export const DEFAULT_GOODBYE_GREETING: GreetingConfig = {
	version: 2,
	enabled: false,
	channelId: null,
	template: '{유저이름}님이 서버를 떠났어요.',
	useImage: true,
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

// --- 카드 템플릿 (프리셋 레이아웃) ---
/** 완성형 카드 디자인 프리셋 — 에디터가 골라 시작한 뒤 자유 수정한다. */
export type GreetingTemplate = {
	id: string;
	name: string;
	image: GreetingImage;
};

export const GREETING_TEMPLATES: readonly GreetingTemplate[] = [
	{
		id: 'classic-center',
		name: '클래식 중앙',
		image: {
			background: { presetId: 'rose', dataUri: null },
			layers: [
				{ id: 'avatar', type: 'avatar', x: 50, y: 20, size: 180, ringColor: '#ffffff' },
				{ id: 'title', type: 'text', x: 50, y: 44, size: 44, color: '#ffffff', bold: true, align: 'center', text: '{유저이름} 님 반가워요!' },
				{
					id: 'subtitle',
					type: 'text',
					x: 50,
					y: 60,
					size: 24,
					color: '#ffffff',
					bold: false,
					align: 'center',
					text: '{서버}의 {멤버수}번째 멤버'
				}
			]
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
	}
];

// --- 템플릿 변수 ---
/** 템플릿 변수 메타데이터 — dashboard 에디터의 변수 삽입 칩과 bot 치환기가 함께 참조 */
export type GreetingTemplateVariable = { token: string; description: string; usableInImage: boolean };

export const GREETING_TEMPLATE_VARIABLES: readonly GreetingTemplateVariable[] = [
	{ token: '{유저}', description: '멘션(@유저)으로 표시 — 봇 메시지 전용, 이미지 카드에는 못 써요', usableInImage: false },
	{ token: '{유저이름}', description: '멤버 표시 이름(닉네임)', usableInImage: true },
	{ token: '{서버}', description: '서버 이름', usableInImage: true },
	{ token: '{멤버수}', description: '서버 멤버 수', usableInImage: true }
];

/** 커스텀 배경 프리셋 — 렌더러가 코드로 그린다 (아이디+이름 메타데이터) */
export type PresetBackground = { id: string; name: string };

export const PRESET_BACKGROUNDS: readonly PresetBackground[] = [
	{ id: 'rose', name: '로즈' },
	{ id: 'plum', name: '플럼' },
	{ id: 'gold', name: '골드' }
];

export const PRESET_BACKGROUND_IDS: readonly string[] = PRESET_BACKGROUNDS.map((preset) => preset.id);

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
