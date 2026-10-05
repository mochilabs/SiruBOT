/** AI 채팅 모드 — 봇 GuildService의 AiMode와 일치해야 해요 */
export type AiMode = "all" | "channels" | "off";

/** /api/servers/[id]/ai GET·PUT 본문 */
export interface AiPolicy {
	mode: AiMode;
	channelIds: string[];
	historyCount: number;
}

/** /api/servers/[id]/settings GET·PUT 본문 (봇 Guild 모델의 일반 설정) */
export interface GuildSettings {
	volume: number;
	repeat: "off" | "track" | "queue";
	related: boolean;
	enableController: boolean;
	sponsorBlockSegments: string[];
	djRoleId: string | null;
	textChannelId: string | null;
	voiceChannelId: string | null;
	pinnedChannelId: string | null;
	pinnedChannelMode: "play" | "select";
	jtcEnabled: boolean;
	jtcCategoryId: string | null;
	jtcMarkerChannelId: string | null;
	jtcTemplate: string;
	jtcUserLimit: number;
	gaplessEnabled: boolean;
	crossfadeEnabled: boolean;
	crossfadeMs: number;
}
