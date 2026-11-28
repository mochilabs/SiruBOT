import type { Guild } from '@sirubot/prisma';
import { isRepeatMode, normalizeRepeatMode, normalizeTtsAnnounceMode, type TtsAnnounceModeSetting } from '@sirubot/utils/guildSettingsContract';
import type { RepeatMode } from 'lavalink-client';
import type { MemberPermissionPort } from '../../lib/discordPorts.ts';
import type { GuildSettingsStore } from './store.ts';

export async function updateVolume(store: GuildSettingsStore, guildId: string, volume: number): Promise<Guild> {
	const guild = await store.upsertField(guildId, 'volume', volume);
	return guild;
}

export async function getVolume(store: GuildSettingsStore, guildId: string) {
	const guild = await store.getGuild(guildId);
	return guild.volume;
}

export async function updateTtsVolume(store: GuildSettingsStore, guildId: string, volume: number): Promise<Guild> {
	const guild = await store.upsertField(guildId, 'ttsVolume', volume);
	return guild;
}

export async function getTtsVolume(store: GuildSettingsStore, guildId: string) {
	const guild = await store.getGuild(guildId);
	return guild.ttsVolume;
}

export async function updateTtsDuck(store: GuildSettingsStore, guildId: string, duckLevel: number): Promise<Guild> {
	const guild = await store.upsertField(guildId, 'ttsDuckLevel', duckLevel);
	return guild;
}

export async function getTtsDuck(store: GuildSettingsStore, guildId: string) {
	const guild = await store.getGuild(guildId);
	return guild.ttsDuckLevel;
}

export type TtsAnnounceMode = TtsAnnounceModeSetting;

export const normalizeAnnounceMode = normalizeTtsAnnounceMode;

export async function getTtsAnnounceMode(store: GuildSettingsStore, guildId: string): Promise<TtsAnnounceMode> {
	const guild = await store.getGuild(guildId);
	return normalizeAnnounceMode(guild.ttsAnnounceMode);
}

export async function setTtsAnnounceMode(store: GuildSettingsStore, guildId: string, mode: TtsAnnounceMode): Promise<TtsAnnounceMode> {
	const guild = await store.upsertField(guildId, 'ttsAnnounceMode', mode);
	return normalizeAnnounceMode(guild.ttsAnnounceMode);
}

export async function getDJRole(store: GuildSettingsStore, guildId: string): Promise<string | null> {
	const guild = await store.getGuild(guildId);
	return guild.djRoleId;
}

export async function setDJRole(store: GuildSettingsStore, guildId: string, djRoleId: string | null) {
	const guild = await store.upsertField(guildId, 'djRoleId', djRoleId);
	return guild;
}

export async function hasDJRole(store: GuildSettingsStore, guildId: string, member: MemberPermissionPort) {
	const djRoleId = await getDJRole(store, guildId);
	if (djRoleId === null || member.isAdministrator()) return true;
	return member.hasRole(djRoleId);
}

export async function getRepeat(store: GuildSettingsStore, guildId: string): Promise<RepeatMode> {
	const guild = await store.getGuild(guildId);
	return normalizeRepeatMode(guild.repeat) as RepeatMode;
}

export async function setRepeat(store: GuildSettingsStore, guildId: string, repeat: RepeatMode): Promise<RepeatMode> {
	if (!isRepeatMode(repeat)) throw new Error('Invalid repeat value');
	const guild = await store.upsertField(guildId, 'repeat', repeat);
	return guild.repeat as RepeatMode;
}

export async function getRelated(store: GuildSettingsStore, guildId: string): Promise<boolean> {
	const guild = await store.getGuild(guildId);
	return guild.related;
}

export async function setRelated(store: GuildSettingsStore, guildId: string, related: boolean): Promise<boolean> {
	const guild = await store.upsertField(guildId, 'related', related);
	return guild.related;
}

export async function getEnableController(store: GuildSettingsStore, guildId: string): Promise<boolean> {
	const guild = await store.getGuild(guildId);
	return guild.enableController;
}

export async function setEnableController(store: GuildSettingsStore, guildId: string, enableController: boolean) {
	const guild = await store.upsertField(guildId, 'enableController', enableController);
	return guild.enableController;
}

export async function setSponsorBlockSegments(store: GuildSettingsStore, guildId: string, segments: string[]): Promise<string[]> {
	const guild = await store.upsertField(guildId, 'sponsorBlockSegments', segments);
	return guild.sponsorBlockSegments;
}
