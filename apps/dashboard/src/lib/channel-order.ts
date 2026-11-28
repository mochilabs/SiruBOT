import { ChannelTypeValue, type DiscordChannelSummary } from "@/types/discord";

const TEXT_CHANNEL_TYPES = new Set<number>([ChannelTypeValue.GuildText, ChannelTypeValue.GuildAnnouncement]);

// discord.js channel.position is scoped per parent category and channel type group.
export function sortChannelsForDisplay<T extends DiscordChannelSummary>(channels: readonly T[]): T[] {
	const categoryRanks = new Map<string, number>();
	for (const channel of channels) {
		if (channel.type === ChannelTypeValue.GuildCategory) categoryRanks.set(channel.id, channel.position);
	}

	const key = (channel: T): [number, number, number, number] => {
		const isCategory = channel.type === ChannelTypeValue.GuildCategory;
		const parentRank = channel.parentId ? categoryRanks.get(channel.parentId) : undefined;
		const bucket = isCategory ? 1 + channel.position : parentRank === undefined ? 0 : 1 + parentRank;
		const headerRank = isCategory ? 0 : 1;
		const typeRank = isCategory ? 0 : TEXT_CHANNEL_TYPES.has(channel.type) ? 0 : 1;
		return [bucket, headerRank, typeRank, channel.position];
	};

	return [...channels].sort((a, b) => {
		const left = key(a);
		const right = key(b);
		for (let index = 0; index < left.length; index += 1) {
			if (left[index] !== right[index]) return left[index] - right[index];
		}
		return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
	});
}
