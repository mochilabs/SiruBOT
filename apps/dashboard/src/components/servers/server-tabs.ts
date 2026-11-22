import type { BotModuleId } from "@sirubot/utils/modules";

/**
 * 서버 대시보드 탭 목록 — 아이콘 없는 순수 데이터예요.
 * server-dashboard.tsx가 아이콘을 붙여 렌더링하고,
 * servers/[id]/loading.tsx 스켈레톤이 같은 목록으로 탭 수를 따라가요 (9/7 하드코딩 방지).
 * `module`이 있는 탭은 해당 봇 모듈이 꺼졌을 때 사이드바에서 흐리게 표시해요.
 */
export const SERVER_TABS = [
	{ key: "overview", label: "개요", group: "general" },
	{ key: "modules", label: "모듈", group: "general" },
	{ key: "music", label: "음악", group: "music", module: "music" },
	{ key: "player-live", label: "라이브", group: "music", module: "music" },
	{ key: "stats", label: "통계", group: "music", module: "music" },
	{ key: "ai", label: "AI 채팅", group: "chat", module: "ai" },
	{ key: "custom-commands", label: "커스텀 명령어", group: "chat", module: "community" },
	{ key: "chat-tools", label: "채팅 유틸", group: "chat", module: "utility" },
	{ key: "channels", label: "채널·권한", group: "community" },
	{ key: "greeting", label: "멤버", group: "community", module: "community" },
	{ key: "ticket", label: "티켓", group: "community", module: "community" },
	{ key: "starboard", label: "스타보드", group: "community", module: "community" },
	{ key: "scheduled-messages", label: "예약 메시지", group: "community", module: "community" },
	{ key: "giveaways", label: "기브어웨이", group: "community", module: "community" },
	{ key: "role-panels", label: "역할 패널", group: "community", module: "community" },
	{ key: "social", label: "소셜 알림", group: "community" },
	{ key: "jtc", label: "임시 음성", group: "community", module: "community" },
	{ key: "profile", label: "봇 프로필", group: "style" },
	{ key: "assets", label: "에셋", group: "style" },
] as const;

/** 사이드바·모바일 내비게이션의 그룹 — SERVER_TABS가 그룹 순서대로 정렬돼 있어요 */
export const SERVER_TAB_GROUPS = {
	general: "기본",
	music: "음악",
	chat: "채팅",
	community: "커뮤니티",
	style: "꾸미기",
} as const;

export type ServerTabKey = (typeof SERVER_TABS)[number]["key"];

export const DEFAULT_SERVER_TAB: ServerTabKey = "overview";

const TAB_KEYS = new Set<string>(SERVER_TABS.map((item) => item.key));
const TAB_MODULES = new Map<ServerTabKey, BotModuleId>(
	SERVER_TABS.flatMap((item) => ("module" in item ? [[item.key, item.module] as const] : [])),
);

/** URL `?tab=` 값을 유효한 탭 키로 정규화해요. 없거나 알 수 없는 값이면 개요 탭을 돌려줘요. */
export function resolveServerTab(value: string | null | undefined): ServerTabKey {
	const normalized = value === "mixer" ? "music" : value;
	return normalized && TAB_KEYS.has(normalized) ? (normalized as ServerTabKey) : DEFAULT_SERVER_TAB;
}

/** 탭이 속한 봇 모듈 id. 모듈과 무관한 탭이면 null이에요. */
export function getTabModule(key: ServerTabKey): BotModuleId | null {
	return TAB_MODULES.get(key) ?? null;
}
