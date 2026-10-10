import { z } from 'zod';

/**
 * 멤버 인사(환영/작별) 공용 계약 — bot 리스너, data-api 렌더러, dashboard 에디터가 함께 쓴다.
 * Prisma Guild.welcome / goodbye 컬럼(Json?)에 이 구조 그대로 저장한다.
 * 템플릿 변수: {유저} {유저이름} {서버} {멤버수} — GREETING_TEMPLATE_VARIABLES 참고.
 */

/** 인사 카드에 그릴 텍스트 1개. x/y는 카드 기준 % 좌표(0~100), size는 px. */
export type GreetingText = { text: string; x: number; y: number; size: number; color: string; bold: boolean };

/** 인사 카드 이미지 설정 — 배경(프리셋 또는 업로드 dataURI) + 멤버 아바타 + 제목/부제 */
export type GreetingImage = {
	background: { presetId: string | null; dataUri: string | null };
	showAvatar: boolean;
	title: GreetingText;
	subtitle: GreetingText;
};

/** Guild.welcome / goodbye에 저장되는 값. version은 스키마 진화용 리터럴. */
export type GreetingConfig = {
	version: 1;
	enabled: boolean;
	channelId: string | null; // 대상 텍스트 채널
	template: string; // 봇 메시지 본문. 변수: {유저} {유저이름} {서버} {멤버수}
	useImage: boolean;
	image: GreetingImage | null; // useImage가 true일 때만 유효
};

/** 인사 종류 — Guild 컬럼 이름(welcome/goodbye)과 렌더러 분기에 모두 쓴다 */
export type GreetingKind = 'welcome' | 'goodbye';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const SNOWFLAKE = /^\d{17,20}$/;
// jpeg 표기 허용 (image/jpeg). base64 본문은 URL-safe가 아닌 표준 알파벳만 허용.
const DATA_URI = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const DATA_URI_MAX_LENGTH = 1_500_000; // prefix 포함 문자 길이 ≈ 1.1MB 바이너리 상한

export const greetingTextSchema = z.object({
	text: z.string(),
	x: z.number().min(0).max(100),
	y: z.number().min(0).max(100),
	size: z.number().min(12).max(72),
	color: z.string().regex(HEX_COLOR),
	bold: z.boolean()
});

// presetId는 프리셋 목록(id + 이름) 안에서만 유효 — 렌더러가 프리셋을 코드로 직접 그리기 때문.
export const greetingImageSchema = z.object({
	background: z.strictObject({
		presetId: z
			.string()
			.refine((presetId) => PRESET_BACKGROUND_IDS.includes(presetId), { error: '알 수 없는 배경 프리셋' })
			.nullable(),
		dataUri: z.string().regex(DATA_URI).max(DATA_URI_MAX_LENGTH).nullable()
	}),
	showAvatar: z.boolean(),
	title: greetingTextSchema,
	subtitle: greetingTextSchema
});

export const greetingConfigSchema = z
	.object({
		version: z.literal(1),
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

export const DEFAULT_WELCOME_GREETING: GreetingConfig = {
	version: 1,
	enabled: false,
	channelId: null,
	template: '{유저}님이 입장했어요. 반가워요!',
	useImage: true,
	image: {
		background: { presetId: 'rose', dataUri: null },
		showAvatar: true,
		title: { text: '{유저이름} 님 반가워요!', x: 50, y: 38, size: 44, color: '#ffffff', bold: true },
		subtitle: { text: '{서버}의 {멤버수}번째 멤버', x: 50, y: 58, size: 24, color: '#ffffff', bold: false }
	}
};

export const DEFAULT_GOODBYE_GREETING: GreetingConfig = {
	version: 1,
	enabled: false,
	channelId: null,
	template: '{유저이름}님이 서버를 떠났어요.',
	useImage: true,
	image: {
		background: { presetId: 'rose', dataUri: null },
		showAvatar: true,
		title: { text: '잘 가요, {유저이름}', x: 50, y: 38, size: 44, color: '#ffffff', bold: true },
		subtitle: { text: '다음에 또 만나요', x: 50, y: 58, size: 24, color: '#ffffff', bold: false }
	}
};

export const DEFAULT_GREETINGS: Record<GreetingKind, GreetingConfig> = {
	welcome: DEFAULT_WELCOME_GREETING,
	goodbye: DEFAULT_GOODBYE_GREETING
};

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
