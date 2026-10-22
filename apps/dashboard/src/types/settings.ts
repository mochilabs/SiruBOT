/** 채팅 유틸 채널 정책 — 봇 GuildService도 같은 @sirubot/utils/chatTools 계약을 써요 */
export type { ChatToolMode } from "@sirubot/utils/chatTools";

/** /api/servers/[id]/settings GET·PUT 본문 — 단일 소스는 @/lib/schemas의 guildSettingsSchema예요 */
export type { GuildSettings } from "@/lib/schemas";

/** AI 채팅 모드 — 봇 GuildService의 AiMode와 일치해야 해요 */
export type AiMode = "all" | "channels" | "off";

/** /api/servers/[id]/ai GET·PUT 본문 */
export interface AiPolicy {
	mode: AiMode;
	channelIds: string[];
	historyCount: number;
}
