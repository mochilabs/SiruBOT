import type { Prisma } from '@sirubot/prisma';
import { normalizeCustomCommandPrefix, normalizeEmbedFixSites, normalizeEmbedFixTranslateLang } from '@sirubot/utils';
import type { GuildSettingsStore } from './store.ts';
import {
	CHAT_TOOL_TOGGLE_FIELDS,
	computeChannelToggle,
	normalizeAiMode,
	normalizeChatToolMode,
	normalizeTtsMode,
	type AiMode,
	type ChatToolName,
	type ChatToolSettings,
	type ChannelToggleSettings,
	type TtsMode,
	type TtsSettings
} from './types.ts';

export async function getAiSettings(store: GuildSettingsStore, guildId: string) {
	const guild = await store.getGuild(guildId);
	return {
		mode: normalizeAiMode(guild.aiMode),
		channelIds: guild.aiChannelIds
	};
}

export async function getTtsSettings(store: GuildSettingsStore, guildId: string): Promise<TtsSettings> {
	const guild = await store.getGuild(guildId);
	return {
		mode: normalizeTtsMode(guild.ttsMode),
		channelIds: guild.ttsChannelIds
	};
}

export async function getTtsJoinAnnounce(store: GuildSettingsStore, guildId: string): Promise<boolean> {
	const guild = await store.getGuild(guildId);
	return guild.ttsJoinAnnounce;
}

export async function getTtsLeaveAnnounce(store: GuildSettingsStore, guildId: string): Promise<boolean> {
	const guild = await store.getGuild(guildId);
	return guild.ttsLeaveAnnounce;
}

export async function setTtsLeaveAnnounce(store: GuildSettingsStore, guildId: string, enabled: boolean): Promise<boolean> {
	const guild = await store.upsertField(guildId, 'ttsLeaveAnnounce', enabled);
	return guild.ttsLeaveAnnounce;
}

export async function setTtsJoinAnnounce(store: GuildSettingsStore, guildId: string, enabled: boolean): Promise<boolean> {
	const guild = await store.upsertField(guildId, 'ttsJoinAnnounce', enabled);
	return guild.ttsJoinAnnounce;
}

export async function getCustomCommandPrefix(store: GuildSettingsStore, guildId: string): Promise<string> {
	const guild = await store.getGuild(guildId);
	return normalizeCustomCommandPrefix(guild.customCommandPrefix);
}

export async function getChatToolSettings(store: GuildSettingsStore, guildId: string): Promise<ChatToolSettings> {
	const guild = await store.getGuild(guildId);
	return {
		emojiEnlarge: { mode: normalizeChatToolMode(guild.emojiEnlargeMode), channelIds: guild.emojiEnlargeChannelIds },
		quote: { mode: normalizeChatToolMode(guild.quoteMode), channelIds: guild.quoteChannelIds },
		embedFix: { mode: normalizeChatToolMode(guild.embedFixMode), channelIds: guild.embedFixChannelIds },
		embedFixSites: normalizeEmbedFixSites(guild.embedFixSites),
		embedFixSuppressOriginal: guild.embedFixSuppressOriginal,
		embedFixTranslateLang: normalizeEmbedFixTranslateLang(guild.embedFixTranslateLang),
		countingEnabled: guild.countingEnabled,
		countingChannelId: guild.countingChannelId
	};
}

export async function setAiMode(store: GuildSettingsStore, guildId: string, mode: AiMode): Promise<AiMode> {
	const guild = await store.upsertField(guildId, 'aiMode', mode);
	return normalizeAiMode(guild.aiMode);
}

export async function setAiChannelIds(store: GuildSettingsStore, guildId: string, channelIds: string[]): Promise<string[]> {
	const unique = [...new Set(channelIds)];
	const guild = await store.upsertField(guildId, 'aiChannelIds', unique);
	return guild.aiChannelIds;
}

export async function removeAiChannel(store: GuildSettingsStore, guildId: string, channelId: string): Promise<void> {
	const settings = await getAiSettings(store, guildId);
	if (!settings.channelIds.includes(channelId)) return;
	await setAiChannelIds(
		store,
		guildId,
		settings.channelIds.filter((id) => id !== channelId)
	);
}

export async function setChannelAiEnabled(
	store: GuildSettingsStore,
	guildId: string,
	channelId: string,
	enabled: boolean,
	allTextChannelIds: string[]
): Promise<{ mode: AiMode; channelIds: string[] }> {
	const next = computeChannelToggle(await getAiSettings(store, guildId), channelId, enabled, allTextChannelIds);
	const data: Prisma.GuildUpdateInput = { aiMode: next.mode, aiChannelIds: next.channelIds };
	const guild = await store.upsertData(guildId, data);
	return { mode: normalizeAiMode(guild.aiMode), channelIds: guild.aiChannelIds };
}

export async function setChannelTtsEnabled(
	store: GuildSettingsStore,
	guildId: string,
	channelId: string,
	enabled: boolean,
	allTextChannelIds: string[]
): Promise<{ mode: TtsMode; channelIds: string[] }> {
	const next = computeChannelToggle(await getTtsSettings(store, guildId), channelId, enabled, allTextChannelIds);
	const data: Prisma.GuildUpdateInput = { ttsMode: next.mode, ttsChannelIds: next.channelIds };
	const guild = await store.upsertData(guildId, data);
	return { mode: normalizeTtsMode(guild.ttsMode), channelIds: guild.ttsChannelIds };
}

export async function setChannelChatToolEnabled(
	store: GuildSettingsStore,
	guildId: string,
	tool: ChatToolName,
	channelId: string,
	enabled: boolean,
	allTextChannelIds: string[]
): Promise<ChannelToggleSettings> {
	const settings = await getChatToolSettings(store, guildId);
	const next = computeChannelToggle(settings[tool], channelId, enabled, allTextChannelIds);
	const fields = CHAT_TOOL_TOGGLE_FIELDS[tool];
	const data: Prisma.GuildUpdateInput =
		tool === 'emojiEnlarge'
			? { emojiEnlargeMode: next.mode, emojiEnlargeChannelIds: next.channelIds }
			: tool === 'quote'
				? { quoteMode: next.mode, quoteChannelIds: next.channelIds }
				: { embedFixMode: next.mode, embedFixChannelIds: next.channelIds };
	const guild = await store.upsertData(guildId, data);
	return { mode: normalizeChatToolMode(guild[fields.mode]), channelIds: guild[fields.channelIds] };
}

export async function setCountingChannel(
	store: GuildSettingsStore,
	guildId: string,
	channelId: string | null
): Promise<{ countingEnabled: boolean; countingChannelId: string | null }> {
	const data: Prisma.GuildUpdateInput = { countingChannelId: channelId, countingEnabled: channelId !== null };
	const guild = await store.upsertData(guildId, data);
	return { countingEnabled: guild.countingEnabled, countingChannelId: guild.countingChannelId };
}

export async function setCountingEnabled(store: GuildSettingsStore, guildId: string, enabled: boolean): Promise<boolean> {
	const guild = await store.upsertField(guildId, 'countingEnabled', enabled);
	return guild.countingEnabled;
}
