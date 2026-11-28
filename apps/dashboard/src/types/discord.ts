export interface DiscordGuild {
	id: string;
	name: string;
	icon: string | null;
	owner: boolean;
	permissions: number;
	features: string[];
}

export const ChannelTypeValue = {
	GuildText: 0,
	GuildVoice: 2,
	GuildCategory: 4,
	GuildAnnouncement: 5,
	GuildStageVoice: 13,
} as const;

export const SELECTABLE_CHANNEL_TYPES: readonly number[] = [
	ChannelTypeValue.GuildText,
	ChannelTypeValue.GuildVoice,
	ChannelTypeValue.GuildCategory,
	ChannelTypeValue.GuildAnnouncement,
	ChannelTypeValue.GuildStageVoice,
];

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
	color: string | null;
	position: number;
	managed: boolean;
}
