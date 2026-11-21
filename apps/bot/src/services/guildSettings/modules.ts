import { isModuleDisabled, messageFeatureModule, sanitizeDisabledModules, type BotModuleId } from '@sirubot/utils/modules';
import type { GuildSettingsStore } from './store.ts';

/**
 * 서버별 모듈 켜기/끄기 (P-06) — `Guild.disabledModules`를 길드 설정 캐시(60초 TTL, 저장·대시보드 무효화)로 읽어요.
 * 기본은 모두 켜짐이고, 끌 수 없는 모듈(관리)은 저장돼 있어도 켜진 것으로 봐요 (판정은 `@sirubot/utils/modules`).
 */

/** DM 등 길드가 없는 곳은 항상 켜짐이에요. */
export async function isModuleEnabled(store: GuildSettingsStore, guildId: string | null | undefined, moduleId: BotModuleId): Promise<boolean> {
	if (!guildId) return true;
	const guild = await store.getGuild(guildId);
	return !isModuleDisabled(guild.disabledModules, moduleId);
}

/**
 * 메시지·이벤트로 동작하는 기능(`messageFeatures`의 id)이 이 서버에서 켜져 있는지 — 리스너 맨 앞에서 한 줄로 검사해요.
 * 꺼져 있으면 리스너는 조용히 무시해요. 모듈 표에 없는 id는 항상 켜짐이에요.
 */
export async function isMessageFeatureEnabled(store: GuildSettingsStore, guildId: string | null | undefined, featureId: string): Promise<boolean> {
	const moduleId = messageFeatureModule(featureId);
	return moduleId ? isModuleEnabled(store, guildId, moduleId) : true;
}

/** 이 서버에서 꺼진 모듈 목록 (정리된 값) */
export async function getDisabledModules(store: GuildSettingsStore, guildId: string): Promise<BotModuleId[]> {
	const guild = await store.getGuild(guildId);
	return sanitizeDisabledModules(guild.disabledModules);
}

/** 꺼진 모듈 목록을 저장해요. 모르는 id와 끌 수 없는 모듈은 버려요. 캐시는 store가 함께 갱신해요. */
export async function setDisabledModules(store: GuildSettingsStore, guildId: string, moduleIds: readonly string[]): Promise<BotModuleId[]> {
	const guild = await store.upsertField(guildId, 'disabledModules', sanitizeDisabledModules(moduleIds));
	return sanitizeDisabledModules(guild.disabledModules);
}
