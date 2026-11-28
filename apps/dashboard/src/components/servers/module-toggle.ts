import { sanitizeDisabledModules } from "@sirubot/utils/modules";

export function toggleModuleDisabled(disabledModules: readonly string[], moduleId: string, enabled: boolean): string[] {
	const next = new Set(disabledModules);
	if (enabled) next.delete(moduleId);
	else next.add(moduleId);
	return sanitizeDisabledModules([...next]);
}
