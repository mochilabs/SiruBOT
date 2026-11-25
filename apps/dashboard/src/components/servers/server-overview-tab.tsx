"use client";

import { useState } from "react";
import Link from "next/link";
import { BOT_MODULES, type BotModuleId, isModuleDisabled, sanitizeDisabledModules } from "@sirubot/utils/modules";
import { ArrowRight, ExternalLink, Hash, LayoutDashboard, Play, Ticket } from "lucide-react";

import { SectionLabel } from "@/components/primitives/section-label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useGuildSettings } from "@/hooks/use-guild-settings";
import { notifyApiError, notifySaved } from "@/lib/notify";
import { cn } from "@/lib/utils";

import { ModuleIcon } from "./module-icon";
import { toggleModuleDisabled } from "./module-toggle";
import type { ServerTabKey } from "./server-tabs";
import { PanelError, PanelHeader, PanelLoading } from "./settings-shared";

const quickRowClass =
	"group flex min-h-14 w-full items-center gap-3.5 rounded-row py-3 text-left transition-colors duration-fast hover:bg-surface-2/60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring";

interface ServerOverviewTabProps {
	guildId: string;
	onSelectTab: (tab: ServerTabKey) => void;
}

/**
 * 서버 대시보드 개요 탭 — 빠른 작업과 모듈 켜기/끄기 상태를 한 화면에 모아요.
 * 설정 캐시는 useGuildSettings(SWR)를 공유해서 다른 탭과 중복 요청하지 않아요.
 */
export function ServerOverviewTab({ guildId, onSelectTab }: ServerOverviewTabProps) {
	const { settings, isLoading, error, saving, save, reload } = useGuildSettings(guildId);
	const [pendingModule, setPendingModule] = useState<BotModuleId | null>(null);

	if (isLoading || (!settings && !error)) return <PanelLoading label="서버 개요 불러오는 중…" />;
	if (error) return <PanelError error={error} onRetry={reload} />;
	if (!settings) return <PanelLoading label="서버 개요 불러오는 중…" />;

	const disabledModules = sanitizeDisabledModules(settings.disabledModules);
	const enabledCount = BOT_MODULES.length - disabledModules.length;

	const handleToggleModule = async (moduleId: BotModuleId, label: string, enabled: boolean) => {
		if (saving || pendingModule) return;
		const next = toggleModuleDisabled(disabledModules, moduleId, enabled);
		setPendingModule(moduleId);
		try {
			await save({ disabledModules: next });
			notifySaved(`${label} 모듈을 ${enabled ? "켰어요" : "껐어요"}.`);
		} catch (err) {
			notifyApiError(err, "모듈 상태를 바꾸지 못했어요.");
		} finally {
			setPendingModule(null);
		}
	};

	return (
		<div className="space-y-6">
			<Card padding="lg" className="gap-6">
				<PanelHeader
					icon={<LayoutDashboard className="h-5 w-5" />}
					title="서버 개요"
					description="모듈 상태와 자주 쓰는 설정이에요."
					action={
						<Badge variant="primary" size="md" className="tabular-nums">
							켜진 모듈 {enabledCount} / {BOT_MODULES.length}
						</Badge>
					}
				/>

				{/* 빠른 작업: 같은 크기의 타일 대신 구분선으로 나눈 한 목록이에요 */}
				<section aria-label="빠른 작업" className="space-y-1">
					<SectionLabel className="px-0">빠른 작업</SectionLabel>
					<ul className="divide-y divide-border-subtle">
						<li>
							<button type="button" onClick={() => onSelectTab("channels")} className={quickRowClass}>
								<Hash size={18} aria-hidden className="shrink-0 text-primary-text" />
								<span className="min-w-0 flex-1">
									<span className="block text-sm font-semibold text-foreground">기본 채널 설정</span>
									<span className="block text-xs text-muted-foreground">명령어 채널·고정 패널·입력 재생 설정</span>
								</span>
								<ArrowRight size={16} aria-hidden className="shrink-0 text-muted-foreground transition-transform duration-fast group-hover:translate-x-0.5" />
							</button>
						</li>
						<li>
							<Link href={`/player/${guildId}`} className={quickRowClass}>
								<Play size={18} aria-hidden className="shrink-0 text-primary-text" />
								<span className="min-w-0 flex-1">
									<span className="block text-sm font-semibold text-foreground">플레이어 열기</span>
									<span className="block text-xs text-muted-foreground">웹에서 재생과 대기열을 바로 조작</span>
								</span>
								<ExternalLink size={16} aria-hidden className="shrink-0 text-muted-foreground" />
							</Link>
						</li>
						<li>
							<button type="button" onClick={() => onSelectTab("ticket")} className={quickRowClass}>
								<Ticket size={18} aria-hidden className="shrink-0 text-primary-text" />
								<span className="min-w-0 flex-1">
									<span className="block text-sm font-semibold text-foreground">티켓 패널 게시</span>
									<span className="block text-xs text-muted-foreground">문의 패널을 채널에 올리고 관리</span>
								</span>
								<ArrowRight size={16} aria-hidden className="shrink-0 text-muted-foreground transition-transform duration-fast group-hover:translate-x-0.5" />
							</button>
						</li>
					</ul>
				</section>
			</Card>

			{/* 모듈 카드 */}
			<Card padding="lg" className="gap-5">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<div className="space-y-0.5">
						<h2 className="text-base font-bold text-foreground">모듈 상태</h2>
						<p className="text-xs text-muted-foreground">이 서버에서 쓸 기능을 켜고 꺼요.</p>
					</div>
				</div>

				<ul className="divide-y divide-border-subtle">
					{BOT_MODULES.map((module) => {
						const enabled = !isModuleDisabled(disabledModules, module.id);
						const titleId = `overview-module-${module.id}-title`;
						return (
							<li key={module.id} className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
								<div className={cn("min-w-0 space-y-0.5 transition-opacity duration-fast", !enabled && "opacity-60")}>
									<div className="flex flex-wrap items-center gap-1.5">
										<p id={titleId} className="text-sm font-semibold text-foreground">
											<ModuleIcon id={module.id} className="mr-1.5" />
											{module.label}
										</p>
										{!module.toggleable && (
											<Badge variant="secondary" size="sm">
												항상 켜짐
											</Badge>
										)}
									</div>
									<p className="text-xs text-muted-foreground">{module.description}</p>
								</div>
								<div className="shrink-0">
									<Switch
										checked={enabled}
										onChange={(checked: boolean) => void handleToggleModule(module.id, module.label, checked)}
										disabled={saving || pendingModule !== null || !module.toggleable}
										aria-labelledby={titleId}
									/>
								</div>
							</li>
						);
					})}
				</ul>
			</Card>
		</div>
	);
}
