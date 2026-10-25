import type { Guild } from '@sirubot/prisma';
import { GuildMember, PermissionFlagsBits } from 'discord.js';
import type { RepeatMode } from 'lavalink-client';
import type { GuildSettingsStore } from './store.ts';

/**
 * 재생 정책 설정(볼륨·DJ·반복·연관 재생·컨트롤러·SponsorBlock) CRUD —
 * 읽기는 store.getGuild 캐시를, 쓰기는 store.upsertField 공용 헬퍼를 써요.
 */

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

export async function getTtsParallel(store: GuildSettingsStore, guildId: string): Promise<boolean> {
	const guild = await store.getGuild(guildId);
	return guild.ttsParallelEnabled;
}

export async function setTtsParallel(store: GuildSettingsStore, guildId: string, enabled: boolean): Promise<boolean> {
	const guild = await store.upsertField(guildId, 'ttsParallelEnabled', enabled);
	return guild.ttsParallelEnabled;
}

export async function getDJRole(store: GuildSettingsStore, guildId: string): Promise<string | null> {
	const guild = await store.getGuild(guildId);
	return guild.djRoleId;
}

export async function setDJRole(store: GuildSettingsStore, guildId: string, djRoleId: string | null) {
	const guild = await store.upsertField(guildId, 'djRoleId', djRoleId);
	return guild;
}

export async function hasDJRole(store: GuildSettingsStore, guildId: string, member: GuildMember) {
	const djRoleId = await getDJRole(store, guildId);
	if (djRoleId === null || member.permissions.has(PermissionFlagsBits.Administrator)) return true;
	return member.roles.cache.has(djRoleId);
}

export async function getRepeat(store: GuildSettingsStore, guildId: string): Promise<RepeatMode> {
	const guild = await store.getGuild(guildId);
	return guild.repeat as RepeatMode;
}

export async function setRepeat(store: GuildSettingsStore, guildId: string, repeat: RepeatMode): Promise<RepeatMode> {
	if (repeat !== 'off' && repeat !== 'track' && repeat !== 'queue') throw new Error('Invalid repeat value');
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

/** SponsorBlock 카테고리 목록 — playerHandler가 세그먼트를 다시 계산할 때 즉시 최신 값을 읽도록 캐시도 함께 갱신해요. */
export async function setSponsorBlockSegments(store: GuildSettingsStore, guildId: string, segments: string[]): Promise<string[]> {
	const guild = await store.upsertField(guildId, 'sponsorBlockSegments', segments);
	return guild.sponsorBlockSegments;
}
