export interface DiscordGuild {
	id: string;
	name: string;
	icon: string | null;
	owner: boolean;
	permissions: number;
	features: string[];
}

/** Discord 채널 타입 (discord-api-types ChannelType과 동일한 값) */
export const ChannelTypeValue = {
	GuildText: 0,
	GuildVoice: 2,
	GuildCategory: 4,
	GuildAnnouncement: 5,
	GuildStageVoice: 13,
} as const;

/** 대시보드 채널 픽커에서 허용하는 채널 타입 */
export const SELECTABLE_CHANNEL_TYPES: readonly number[] = [
	ChannelTypeValue.GuildText,
	ChannelTypeValue.GuildVoice,
	ChannelTypeValue.GuildCategory,
	ChannelTypeValue.GuildAnnouncement,
	ChannelTypeValue.GuildStageVoice,
];

/** 대시보드에서 쓰는 채널 요약 — Discord API 원본이 아니라 가공된 값만 클라이언트로 내려가요 */
export interface DiscordChannelSummary {
	id: string;
	name: string;
	type: number;
	parentId: string | null;
	position: number;
}

export interface DiscordRoleSummary {
	id: string;
	name: string;
	/** `#rrggbb` 또는 null(기본색) */
	color: string | null;
	position: number;
	managed: boolean;
}
