import { normalizeTextChannelMode } from '@sirubot/utils/guildSettingsContract';
import type { GuildSettingsStore } from './store.ts';
import type { TextChannelMode } from './types.ts';

/**
 * 기본 채널(명령어 허용·상시 패널·입력 재생) 설정 CRUD — 읽기는 store.getGuild 캐시를,
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

/**
 * 상시 패널을 쓰는 채널 — 기본 텍스트 채널 + 채팅 입력 재생 + 입력 메시지 삭제(보낸 후 삭제)가 모두 켜졌을 때만 돌려줘요.
 * 기본 채널만 설정한 경우는 명령어 제한만 하고 패널 메시지는 고정하지 않아요.
 */
export async function getPanelChannel(store: GuildSettingsStore, guildId: string): Promise<string | null> {
	const guild = await store.getGuild(guildId);
	return guild.textChannelId && guild.textChannelInputPlay && guild.textChannelDeleteInput ? guild.textChannelId : null;
}

/** 기본 채널 상시 패널 메시지 ID — 채널이 바뀌면 의미가 없어지므로 호출부가 함께 비워요. */
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

/** 기본 채널 입력 메시지 삭제 여부 — 봇 처리 후 사용자 메시지를 지운다 (Manage Messages 권한 필요) */
export async function getTextChannelDeleteInput(store: GuildSettingsStore, guildId: string): Promise<boolean> {
	const guild = await store.getGuild(guildId);
	return guild.textChannelDeleteInput;
}

export async function setTextChannelDeleteInput(store: GuildSettingsStore, guildId: string, deleteInput: boolean) {
	const guild = await store.upsertField(guildId, 'textChannelDeleteInput', deleteInput);
	return guild.textChannelDeleteInput;
}

/** 기본 채널에서 입력한 텍스트를 검색어로 재생할지 */
export async function getTextChannelInputPlay(store: GuildSettingsStore, guildId: string): Promise<boolean> {
	const guild = await store.getGuild(guildId);
	return guild.textChannelInputPlay;
}

export async function setTextChannelInputPlay(store: GuildSettingsStore, guildId: string, enabled: boolean) {
	const guild = await store.upsertField(guildId, 'textChannelInputPlay', enabled);
	return guild.textChannelInputPlay;
}
