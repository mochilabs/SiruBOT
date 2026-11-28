export type { ChatToolMode } from "@sirubot/utils/chatTools";

/** 단일 소스: @/lib/schemas의 guildSettingsSchema */
export type { GuildSettings } from "@/lib/schemas";

export type AiMode = "all" | "channels" | "off";

export interface AiPolicy {
	mode: AiMode;
	channelIds: string[];
	historyCount: number;
}
