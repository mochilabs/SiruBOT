import { normalizeTextChannelMode } from '@sirubot/utils/guildSettingsContract';
import type { GuildSettingsStore } from './store.ts';
import type { TextChannelMode } from './types.ts';

export async function setDefaultTextChannel(store: GuildSettingsStore, guildId: string, textChannelId: string | null) {
	const guild = await store.upsertField(guildId, 'textChannelId', textChannelId);
	return guild.textChannelId;
}

export async function getDefaultTextChannel(store: GuildSettingsStore, guildId: string): Promise<string | null> {
	const guild = await store.getGuild(guildId);
	return guild.textChannelId;
}

export async function setDefaultVoiceChannel(store: GuildSettingsStore, guildId: string, voiceChannelId: string | null) {
	const guild = await store.upsertField(guildId, 'voiceChannelId', voiceChannelId);
	return guild.voiceChannelId;
}

export async function getPanelChannel(store: GuildSettingsStore, guildId: string): Promise<string | null> {
	const guild = await store.getGuild(guildId);
	return guild.textChannelId && guild.textChannelInputPlay && guild.textChannelDeleteInput ? guild.textChannelId : null;
}

export async function getTextMessage(store: GuildSettingsStore, guildId: string): Promise<string | null> {
	const guild = await store.getGuild(guildId);
	return guild.textMessageId ?? null;
}

export async function setTextMessage(store: GuildSettingsStore, guildId: string, messageId: string | null) {
	const guild = await store.upsertField(guildId, 'textMessageId', messageId);
	return guild.textMessageId ?? null;
}

export async function getTextChannelMode(store: GuildSettingsStore, guildId: string): Promise<TextChannelMode> {
	const guild = await store.getGuild(guildId);
	return normalizeTextChannelMode(guild.textChannelMode);
}

export async function setTextChannelMode(store: GuildSettingsStore, guildId: string, mode: TextChannelMode) {
	const guild = await store.upsertField(guildId, 'textChannelMode', mode);
	return guild.textChannelMode as TextChannelMode;
}

export async function getTextChannelDeleteInput(store: GuildSettingsStore, guildId: string): Promise<boolean> {
	const guild = await store.getGuild(guildId);
	return guild.textChannelDeleteInput;
}

export async function setTextChannelDeleteInput(store: GuildSettingsStore, guildId: string, deleteInput: boolean) {
	const guild = await store.upsertField(guildId, 'textChannelDeleteInput', deleteInput);
	return guild.textChannelDeleteInput;
}

export async function getTextChannelInputPlay(store: GuildSettingsStore, guildId: string): Promise<boolean> {
	const guild = await store.getGuild(guildId);
	return guild.textChannelInputPlay;
}

export async function setTextChannelInputPlay(store: GuildSettingsStore, guildId: string, enabled: boolean) {
	const guild = await store.upsertField(guildId, 'textChannelInputPlay', enabled);
	return guild.textChannelInputPlay;
}
