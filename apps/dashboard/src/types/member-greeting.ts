import type {
	GreetingConfig,
	GreetingImage,
	GreetingKind,
	GreetingTemplateVariable,
	GreetingText,
	PresetBackground
} from "@sirubot/utils";

/**
 * 멤버 인사 대시보드 계약 모음.
 * 구조 타입은 packages/utils/src/memberGreeting.ts의 원본 계약을 type import로 써요.
 * 값 상수 템플릿/프리셋/기본값은 클라이언트 번들에서 원본 barrel을 임포트할 수 없어요
 * (@sentry/node 등 노드 의존이 함께 번들되기 때문) — 아래 복제본으로, 계약이 바뀌면
 * 원본(그리고 app/api 쪽)과 같이 업데이트해요.
 */
export type { GreetingConfig, GreetingImage, GreetingKind, GreetingTemplateVariable, GreetingText, PresetBackground };

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

/** 저장 값이 없을 때 UI에 깔아 보여주는 기본 인사 설정 — 원본 DEFAULT_GREETINGS의 복제본이에요 */
export const DEFAULT_GREETINGS: Record<GreetingKind, GreetingConfig> = {
	welcome: {
		version: 1,
		enabled: false,
		channelId: null,
		template: "{유저}님이 입장했어요. 반가워요!",
		useImage: true,
		image: {
			background: { presetId: "rose", dataUri: null },
			showAvatar: true,
			title: { text: "{유저이름} 님 반가워요!", x: 50, y: 38, size: 44, color: "#ffffff", bold: true },
			subtitle: { text: "{서버}의 {멤버수}번째 멤버", x: 50, y: 58, size: 24, color: "#ffffff", bold: false }
		}
	},
	goodbye: {
		version: 1,
		enabled: false,
		channelId: null,
		template: "{유저이름}님이 서버를 떠났어요.",
		useImage: true,
		image: {
			background: { presetId: "rose", dataUri: null },
			showAvatar: true,
			title: { text: "잘 가요, {유저이름}", x: 50, y: 38, size: 44, color: "#ffffff", bold: true },
			subtitle: { text: "다음에 또 만나요", x: 50, y: 58, size: 24, color: "#ffffff", bold: false }
		}
	}
};

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