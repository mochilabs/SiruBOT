"use client";

import { BOT_MODULES, isModuleDisabled, sanitizeDisabledModules } from "@sirubot/utils/modules";
import { LayoutGrid } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import type { GuildSettings } from "@/types/settings";

import { SettingsPanel, useSettingsPanel } from "./settings-panel";
import { InfoBox } from "./settings-shared";

interface ModulesForm {
	disabledModules: string[];
}

const toModulesForm = (settings: GuildSettings): ModulesForm => ({
	disabledModules: sanitizeDisabledModules(settings.disabledModules),
});

/** 모듈 하나를 켜거나 꺼서 새 꺼진 목록을 만들어요. 끌 수 없는 모듈은 바꾸지 않고, 결과는 항상 모듈 표 순서예요. */
export function toggleModuleDisabled(disabledModules: readonly string[], moduleId: string, enabled: boolean): string[] {
	const next = new Set(disabledModules);
	if (enabled) next.delete(moduleId);
	else next.add(moduleId);
	return sanitizeDisabledModules([...next]);
}

function ModulesSettingsPanel({ guildId }: { guildId: string }) {
	const panel = useSettingsPanel(guildId, toModulesForm, "모듈 설정을 저장했어요.");
	const { patch, saving } = panel;

	return (
		<SettingsPanel
			panel={panel}
			icon={<LayoutGrid className="h-5 w-5" />}
			title="모듈"
			description="이 서버에서 쓸 기능 묶음을 켜고 꺼요."
			notice={
				<InfoBox>
					<p>
						끈 모듈의 명령어는 디스코드 명령어 목록에 남아 있지만, 실행하면 꺼져 있다고 안내하고 도움말에서도 빠져요. 이미 설정해 둔 값은 지워지지 않고, 다시 켜면 그대로 돌아와요.
						디스코드에서는 /설정 첫 화면에서도 바꿀 수 있어요.
					</p>
				</InfoBox>
			}
		>
			{(form) => (
				<ul className="space-y-3">
					{BOT_MODULES.map((module) => {
						const enabled = !isModuleDisabled(form.disabledModules, module.id);
						const titleId = `module-${module.id}-title`;
						return (
							<li key={module.id} className="flex items-start justify-between gap-4 rounded-control border border-border p-4">
								<div className="min-w-0 space-y-1">
									<p id={titleId} className="text-sm font-semibold text-foreground">
										<span aria-hidden className="mr-1.5">
											{module.emoji}
										</span>
										{module.label}
										{!module.toggleable && <span className="ml-2 text-xs font-medium text-muted-foreground">항상 켜져 있어요</span>}
									</p>
									<p className="text-xs text-muted-foreground sm:text-sm">{module.description}</p>
									<p className="text-xs text-muted-foreground">
										명령어 {module.commands.length}개{module.messageFeatures.length > 0 ? ` · 명령 없이 쓰는 기능 ${module.messageFeatures.length}개` : ""}
									</p>
								</div>
								<div className="shrink-0 pt-0.5">
									<Switch
										checked={enabled}
										onChange={(checked: boolean) => patch({ disabledModules: toggleModuleDisabled(form.disabledModules, module.id, checked) })}
										disabled={saving || !module.toggleable}
										aria-labelledby={titleId}
									/>
								</div>
							</li>
						);
					})}
				</ul>
			)}
		</SettingsPanel>
	);
}

export function ModulesSettings({ guildId }: { guildId: string }) {
	return <ModulesSettingsPanel guildId={guildId} />;
}
