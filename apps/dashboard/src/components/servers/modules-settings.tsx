"use client";

import { BOT_MODULES, isModuleDisabled, sanitizeDisabledModules } from "@sirubot/utils/modules";
import { LayoutGrid } from "lucide-react";

import { Button } from "@/components/ui/button";
import { COLOR_PRESETS, ColorPicker } from "@/components/ui/color-picker";
import { Switch } from "@/components/ui/switch";
import type { GuildSettings } from "@/types/settings";

import { SettingsPanel, useSettingsPanel } from "./settings-panel";
import { InfoBox } from "./settings-shared";

/** 봇 기본 강조색 — packages/utils DEFAULT_COLOR(0xff85c0)와 같은 값이에요 (대시보드는 utils 루트 barrel을 못 써서 값만 옮겨 적어요). */
const BOT_DEFAULT_ACCENT_HEX = "#ff85c0";

interface ModulesForm {
	disabledModules: string[];
	accentColor: string | null;
}

const toModulesForm = (settings: GuildSettings): ModulesForm => ({
	disabledModules: sanitizeDisabledModules(settings.disabledModules),
	accentColor: settings.accentColor,
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
					<p>끈 모듈의 기존 설정은 유지돼요. 디스코드 /설정에서도 바꿀 수 있어요.</p>
				</InfoBox>
			}
		>
			{(form) => (
				<>
				<div className="mb-6 space-y-2 rounded-control border border-border p-4">
					<p className="text-sm font-semibold text-foreground">서버 강조색</p>
					<p className="text-xs text-muted-foreground sm:text-sm">
						봇 메시지의 강조선 색이에요. 진행바·아이콘·카드 이미지는 봇 기본색(분홍) 그대로예요.
					</p>
					<div className="flex flex-wrap items-center gap-2">
						<ColorPicker
							value={form.accentColor ?? BOT_DEFAULT_ACCENT_HEX}
							label="서버 강조색"
							disabled={saving}
							presets={[BOT_DEFAULT_ACCENT_HEX, ...COLOR_PRESETS]}
							onChange={(color: string) => patch({ accentColor: color })}
						/>
						{form.accentColor !== null && (
							<Button variant="ghost" size="sm" disabled={saving} onClick={() => patch({ accentColor: null })}>
								봇 기본색 사용
							</Button>
						)}
					</div>
				</div>
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
				</>
			)}
		</SettingsPanel>
	);
}

export function ModulesSettings({ guildId }: { guildId: string }) {
	return <ModulesSettingsPanel guildId={guildId} />;
}
