import type { GreetingConfig, GreetingKind } from "@sirubot/utils/memberGreeting";

/**
 * 멤버 인사 대시보드 로컬 타입 (v2) — 이 파일에는 대시보드 API 응답 전용 타입만 남아요.
 * 구조 타입·값 상수·검증 스키마(기본값/템플릿/프리셋/레이아웃/템플릿 변수/greetingConfigSchema)는
 * 전부 packages/utils/src/memberGreeting.ts 원본을 "@sirubot/utils/memberGreeting" 서브패스 임포트로 써요.
 * (배럴 @sirubot/utils는 노드 의존이 번들 경로에 끼어 대시보드 빌드가 깨지므로 서브패스만 허용해요)
 */

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
