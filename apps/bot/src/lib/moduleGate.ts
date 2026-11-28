import { gatedModuleForCommand, gatedModuleForNamespace, moduleDisabledMessage, type BotModuleId } from '@sirubot/utils/modules';

export type ModuleGateResult = { allowed: true } | { allowed: false; moduleId: BotModuleId; message: string };

export type ModuleEnabledLookup = (moduleId: BotModuleId) => Promise<boolean>;

const ALLOWED: ModuleGateResult = { allowed: true };

async function gate(moduleId: BotModuleId | null, isEnabled: ModuleEnabledLookup): Promise<ModuleGateResult> {
	if (!moduleId) return ALLOWED;
	if (await isEnabled(moduleId)) return ALLOWED;
	return { allowed: false, moduleId, message: moduleDisabledMessage(moduleId) };
}

export function gateCommand(commandName: string, isEnabled: ModuleEnabledLookup): Promise<ModuleGateResult> {
	return gate(gatedModuleForCommand(commandName), isEnabled);
}

export function gateNamespace(namespace: string | null, isEnabled: ModuleEnabledLookup): Promise<ModuleGateResult> {
	return gate(namespace ? gatedModuleForNamespace(namespace) : null, isEnabled);
}
