import { sanitizeDisabledModules } from "@sirubot/utils/modules";

/** 모듈 하나를 켜거나 꺼서 새 꺼진 목록을 만들어요. 끌 수 없는 모듈은 바꾸지 않고, 결과는 항상 모듈 표 순서예요. */
export function toggleModuleDisabled(disabledModules: readonly string[], moduleId: string, enabled: boolean): string[] {
	const next = new Set(disabledModules);
	if (enabled) next.delete(moduleId);
	else next.add(moduleId);
	return sanitizeDisabledModules([...next]);
}
