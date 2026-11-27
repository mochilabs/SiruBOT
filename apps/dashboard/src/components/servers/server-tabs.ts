import type { BotModuleId } from "@sirubot/utils/modules";

export const SERVER_TABS = [
	{ key: "overview", label: "개요", group: "general" },
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
	{ key: "birthday", label: "생일 축하", group: "community", module: "community" },
	{ key: "scheduled-messages", label: "예약 메시지", group: "community", module: "community" },
	{ key: "giveaways", label: "나눔", group: "community", module: "community" },
	{ key: "role-panels", label: "역할 패널", group: "community", module: "community" },
	{ key: "social", label: "소셜 알림", group: "community" },
	{ key: "jtc", label: "임시 음성", group: "community", module: "community" },
	{ key: "profile", label: "봇 프로필", group: "style" },
	{ key: "assets", label: "에셋", group: "style" },
] as const;

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

export function resolveServerTab(value: string | null | undefined): ServerTabKey {
	const normalized = value === "mixer" ? "music" : value;
	return normalized && TAB_KEYS.has(normalized) ? (normalized as ServerTabKey) : DEFAULT_SERVER_TAB;
}

export function getTabModule(key: ServerTabKey): BotModuleId | null {
	return TAB_MODULES.get(key) ?? null;
}
