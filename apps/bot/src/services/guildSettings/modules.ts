import { isModuleDisabled, messageFeatureModule, sanitizeDisabledModules, type BotModuleId } from '@sirubot/utils/modules';
import type { GuildSettingsStore } from './store.ts';

export async function isModuleEnabled(store: GuildSettingsStore, guildId: string | null | undefined, moduleId: BotModuleId): Promise<boolean> {
	if (!guildId) return true;
	const guild = await store.getGuild(guildId);
	return !isModuleDisabled(guild.disabledModules, moduleId);
}

export async function isMessageFeatureEnabled(store: GuildSettingsStore, guildId: string | null | undefined, featureId: string): Promise<boolean> {
	const moduleId = messageFeatureModule(featureId);
	return moduleId ? isModuleEnabled(store, guildId, moduleId) : true;
}

export async function getDisabledModules(store: GuildSettingsStore, guildId: string): Promise<BotModuleId[]> {
	const guild = await store.getGuild(guildId);
	return sanitizeDisabledModules(guild.disabledModules);
}

export async function setDisabledModules(store: GuildSettingsStore, guildId: string, moduleIds: readonly string[]): Promise<BotModuleId[]> {
	const guild = await store.upsertField(guildId, 'disabledModules', sanitizeDisabledModules(moduleIds));
	return sanitizeDisabledModules(guild.disabledModules);
}
