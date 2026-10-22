import type { GuildSettingsStore } from './store.ts';
import type { PinnedChannelMode } from './types.ts';

/**
 * 기본 채널·고정 채널(스마트 큐) 설정 CRUD — 읽기는 store.getGuild 캐시를,
 * 쓰기는 store.upsertField 공용 헬퍼를 써요.
 */

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

export async function getDefaultVoiceChannel(store: GuildSettingsStore, guildId: string): Promise<string | null> {
	const guild = await store.getGuild(guildId);
	return guild.voiceChannelId;
}

export async function getPinnedChannel(store: GuildSettingsStore, guildId: string): Promise<string | null> {
	const guild = await store.getGuild(guildId);
	return guild.pinnedChannelId;
}

export async function setPinnedChannel(store: GuildSettingsStore, guildId: string, channelId: string | null) {
	const guild = await store.upsertField(guildId, 'pinnedChannelId', channelId);
	return guild.pinnedChannelId;
}

export async function getPinnedChannelMode(store: GuildSettingsStore, guildId: string): Promise<PinnedChannelMode> {
	const guild = await store.getGuild(guildId);
	return guild.pinnedChannelMode === 'select' ? 'select' : 'play';
}

export async function setPinnedChannelMode(store: GuildSettingsStore, guildId: string, mode: PinnedChannelMode) {
	const guild = await store.upsertField(guildId, 'pinnedChannelMode', mode);
	return guild.pinnedChannelMode as PinnedChannelMode;
}

/** 고정 채널 입력 메시지 삭제 여부 — 봇 처리 후 사용자 메시지를 지운다 (Manage Messages 권한 필요) */
export async function getPinnedChannelDeleteInput(store: GuildSettingsStore, guildId: string): Promise<boolean> {
	const guild = await store.getGuild(guildId);
	return guild.pinnedChannelDeleteInput;
}

export async function setPinnedChannelDeleteInput(store: GuildSettingsStore, guildId: string, deleteInput: boolean) {
	const guild = await store.upsertField(guildId, 'pinnedChannelDeleteInput', deleteInput);
	return guild.pinnedChannelDeleteInput;
}
