import { ChannelType, type Guild } from 'discord.js';

export function collectOtherTextChannelIds(guild: Guild, currentChannelId: string): string[] {
	return guild.channels.cache
		.filter(
			(channel) => channel.id !== currentChannelId && (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement)
		)
		.map((channel) => channel.id);
}
