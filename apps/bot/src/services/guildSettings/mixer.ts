import { container } from '@sapphire/framework';
import type { Prisma } from '@sirubot/prisma';
import type { GuildSettingsStore } from './store.ts';
import type { MixerSettings } from './types.ts';

/**
 * 믹서(갭리스·크로스페이드) 설정 CRUD — 크로스페이드 저장은 재생 중 플레이어에
 * 바로 반영해야 해서 기존과 같이 db.update + 캐시 갱신으로 직접 써요.
 */

export async function getMixerSettings(store: GuildSettingsStore, guildId: string): Promise<MixerSettings> {
	const guild = await store.getGuild(guildId);
	return {
		gaplessEnabled: guild.gaplessEnabled,
		crossfadeEnabled: guild.crossfadeEnabled,
		crossfadeMs: guild.crossfadeMs,
		normalizationEnabled: guild.normalizationEnabled,
		automixEnabled: guild.automixEnabled,
		automixMaxTempoChange: guild.automixMaxTempoChange,
		automixMinConfidence: guild.automixMinConfidence
	};
}

export async function setGapless(store: GuildSettingsStore, guildId: string, enabled: boolean) {
	const guild = await store.upsertField(guildId, 'gaplessEnabled', enabled);
	return guild.gaplessEnabled;
}

export async function setNormalization(store: GuildSettingsStore, guildId: string, enabled: boolean) {
	const guild = await store.upsertField(guildId, 'normalizationEnabled', enabled);
	return guild.normalizationEnabled;
}

export async function setCrossfade(store: GuildSettingsStore, guildId: string, enabled: boolean, durationMs?: number) {
	// Lavalink mixer 플러그인의 겹치기 상한은 15초(15000ms)라 여기서 잘라요
	const clamped = durationMs === undefined ? undefined : Math.round(Math.min(15000, Math.max(500, durationMs)));
	const guild = await store.getGuild(guildId);
	const data: Prisma.GuildUpdateInput = { crossfadeEnabled: enabled };
	if (!enabled) data.automixEnabled = false;
	if (clamped !== undefined) data.crossfadeMs = clamped;
	const updated = await container.db.guild.update({ where: { id: guild.id }, data });
	store.updateCache(updated);
	return { crossfadeEnabled: updated.crossfadeEnabled, crossfadeMs: updated.crossfadeMs };
}

export async function setAutomix(
	store: GuildSettingsStore,
	guildId: string,
	enabled: boolean,
	maxTempoChange?: number,
	minConfidence?: number
): Promise<MixerSettings> {
	if (maxTempoChange !== undefined && (!Number.isFinite(maxTempoChange) || maxTempoChange < 0 || maxTempoChange > 0.12)) {
		throw new RangeError('오토믹스 최대 템포 변경 비율은 0~0.12여야 해요.');
	}
	if (minConfidence !== undefined && (!Number.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1)) {
		throw new RangeError('오토믹스 최소 신뢰도는 0~1이어야 해요.');
	}
	const guild = await store.getGuild(guildId);
	const data: Prisma.GuildUpdateInput = { automixEnabled: enabled };
	if (enabled) data.crossfadeEnabled = true;
	if (maxTempoChange !== undefined) data.automixMaxTempoChange = maxTempoChange;
	if (minConfidence !== undefined) data.automixMinConfidence = minConfidence;
	const updated = await container.db.guild.update({ where: { id: guild.id }, data });
	store.updateCache(updated);
	return getMixerSettings(store, guildId);
}
