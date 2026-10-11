import type {
	GreetingAvatarLayer,
	GreetingConfig,
	GreetingImage,
	GreetingImageLayer,
	GreetingKind,
	GreetingLayer,
	GreetingShapeLayer,
	GreetingTemplate,
	GreetingTemplateVariable,
	GreetingTextLayer,
	PresetBackground
} from "@sirubot/utils";

/**
 * 멤버 인사 대시보드 계약 모음 (v2).
 * 구조 타입은 packages/utils/src/memberGreeting.ts의 원본 계약을 type import로 써요.
 * 값 상수 템플릿/프리셋/기본값은 클라이언트 번들에서 원본 barrel을 임포트할 수 없어요
 * (@sentry/node 등 노드 의존이 함께 번들되기 때문) — 아래 복제본으로, 계약이 바뀌면
 * 원본(그리고 app/api 쪽)과 같이 업데이트해요.
 */
export type {
	GreetingAvatarLayer,
	GreetingConfig,
	GreetingImage,
	GreetingImageLayer,
	GreetingKind,
	GreetingLayer,
	GreetingShapeLayer,
	GreetingTemplate,
	GreetingTemplateVariable,
	GreetingTextLayer,
	PresetBackground
};

/** 템플릿 변수 메타데이터 — 원본 GREETING_TEMPLATE_VARIABLES의 복제본이에요 */
export const GREETING_TEMPLATE_VARIABLES: readonly GreetingTemplateVariable[] = [
	{ token: "{유저}", description: "멘션(@유저)으로 표시 — 봇 메시지 전용, 이미지 카드에는 못 써요", usableInImage: false },
	{ token: "{유저이름}", description: "멤버 표시 이름(닉네임)", usableInImage: true },
	{ token: "{서버}", description: "서버 이름", usableInImage: true },
	{ token: "{멤버수}", description: "서버 멤버 수", usableInImage: true }
];

/** 커스텀 배경 프리셋 목록 — 원본 PRESET_BACKGROUNDS의 복제본이에요 (렌더러가 코드로 그려요) */
export const PRESET_BACKGROUNDS: readonly PresetBackground[] = [
	{ id: "rose", name: "로즈" },
	{ id: "plum", name: "플럼" },
	{ id: "gold", name: "골드" }
];

/** 저장 값이 없을 때 UI에 깔아 보여주는 기본 인사 설정 — 원본 DEFAULT_GREETINGS의 복제본이에요 (v2 레이어) */
export const DEFAULT_GREETINGS: Record<GreetingKind, GreetingConfig> = {
	welcome: {
		version: 2,
		enabled: false,
		channelId: null,
		template: "{유저}님이 입장했어요. 반가워요!",
		useImage: true,
		image: {
			background: { presetId: "rose", dataUri: null },
			layers: [
				{ id: "avatar", type: "avatar", x: 50, y: 20, size: 180, ringColor: "#ffffff" },
				{ id: "title", type: "text", x: 50, y: 44, size: 44, color: "#ffffff", bold: true, align: "center", text: "{유저이름} 님 반가워요!" },
				{ id: "subtitle", type: "text", x: 50, y: 60, size: 24, color: "#ffffff", bold: false, align: "center", text: "{서버}의 {멤버수}번째 멤버" }
			]
		}
	},
	goodbye: {
		version: 2,
		enabled: false,
		channelId: null,
		template: "{유저이름}님이 서버를 떠났어요.",
		useImage: true,
		image: {
			background: { presetId: "rose", dataUri: null },
			layers: [
				{ id: "avatar", type: "avatar", x: 50, y: 20, size: 180, ringColor: "#ffffff" },
				{ id: "title", type: "text", x: 50, y: 44, size: 44, color: "#ffffff", bold: true, align: "center", text: "잘 가요, {유저이름}" },
				{ id: "subtitle", type: "text", x: 50, y: 60, size: 24, color: "#ffffff", bold: false, align: "center", text: "다음에 또 만나요" }
			]
		}
	}
};

/** 완성형 카드 템플릿 — 원본 GREETING_TEMPLATES의 복제본이에요 */
export const GREETING_TEMPLATES: readonly GreetingTemplate[] = [
	{
		id: "classic-center",
		name: "클래식 중앙",
		image: {
			background: { presetId: "rose", dataUri: null },
			layers: [
				{ id: "avatar", type: "avatar", x: 50, y: 20, size: 180, ringColor: "#ffffff" },
				{ id: "title", type: "text", x: 50, y: 44, size: 44, color: "#ffffff", bold: true, align: "center", text: "{유저이름} 님 반가워요!" },
				{ id: "subtitle", type: "text", x: 50, y: 60, size: 24, color: "#ffffff", bold: false, align: "center", text: "{서버}의 {멤버수}번째 멤버" }
			]
		}
	},
	{
		id: "side-avatar",
		name: "좌측 아바타",
		image: {
			background: { presetId: "plum", dataUri: null },
			layers: [
				{ id: "avatar", type: "avatar", x: 22, y: 50, size: 240, ringColor: "#ffb3d9" },
				{ id: "title", type: "text", x: 62, y: 40, size: 48, color: "#ffffff", bold: true, align: "left", text: "{유저이름} 님 환영해요!" },
				{ id: "subtitle", type: "text", x: 62, y: 58, size: 26, color: "#f0e2cf", bold: false, align: "left", text: "{서버}의 {멤버수}번째 멤버" }
			]
		}
	},
	{
		id: "minimal-band",
		name: "미니멀 밴드",
		image: {
			background: { presetId: "gold", dataUri: null },
			layers: [
				{ id: "band", type: "shape", shape: "rect", x: 50, y: 50, width: 1200, height: 220, color: "#231a10", opacity: 0.55 },
				{ id: "avatar", type: "avatar", x: 50, y: 20, size: 150, ringColor: "#d4a574" },
				{ id: "title", type: "text", x: 50, y: 52, size: 40, color: "#ffffff", bold: true, align: "center", text: "{유저이름} 님 환영해요!" },
				{ id: "subtitle", type: "text", x: 50, y: 66, size: 22, color: "#f0e2cf", bold: false, align: "center", text: "{서버} · {멤버수}번째 멤버" }
			]
		}
	}
];

/** GET/PATCH /api/servers/[id]/greeting — 저장 값이 없거나 깨져 있으면 null (기본값은 UI가 깔아요) */
export interface GreetingPair {
	welcome: GreetingConfig | null;
	goodbye: GreetingConfig | null;
}

/**
 * GET /api/servers/[id]/greeting/status — data-api /v1/greeting/state/:guildId 응답을 전달해요.
 * 결과가 아직 없으면 { found: false }예요. requestId로 테스트 요청과 매칭해요.
 */
export interface GreetingTestStatus {
	found: boolean;
	requestId?: string;
	kind?: GreetingKind;
	ok?: boolean;
	error?: string | null;
	sentAt?: number;
}

/** status.found + requestId 매칭이 끝난 뒤의 인라인 안내용 결과 */
export interface GreetingTestResult {
	ok: boolean;
	error: string | null;
	/** 진행 시간 안에 봇 결과가 도착하지 않았어요 — 전송 자체는 성공했을 수 있어요 */
	timedOut?: boolean;
}
