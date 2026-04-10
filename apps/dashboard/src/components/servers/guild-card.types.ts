import type { DiscordGuild } from "@/types/discord";

export interface EnrichedGuild extends DiscordGuild {
	isManageable: boolean;
	isInstalled: boolean;
}

export interface GuildCardProps {
	guild: EnrichedGuild;
	inviteUrl: string | null;
}
