"use client";

import { useState } from "react";
import Link from "next/link";
import { BOT_MODULES, type BotModuleId, isModuleDisabled, sanitizeDisabledModules } from "@sirubot/utils/modules";
import { ArrowRight, ExternalLink, Hash, LayoutDashboard, Play, RotateCcw, Ticket } from "lucide-react";

import { SectionLabel } from "@/components/primitives/section-label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useGuildSettings } from "@/hooks/use-guild-settings";
import { notifyApiError, notifySaved } from "@/lib/notify";
import { createApiFetcher, useGuildResource } from "@/lib/swr";
import type { GuildUsageResponse } from "@/lib/usage-summary";
import { cn } from "@/lib/utils";

import { toggleModuleDisabled } from "./modules-settings";
import type { ServerTabKey } from "./server-tabs";
import { PanelError, PanelHeader, PanelLoading } from "./settings-shared";

const usageFetcher = createApiFetcher<GuildUsageResponse>("서버 사용량을 불러오지 못했어요.", { sessionRetry: true });

interface ServerOverviewTabProps {
	guildId: string;
	onSelectTab: (tab: ServerTabKey) => void;
}

/**
 * 서버 대시보드 개요 탭 — 이번 주 사용량, 빠른 작업, 모듈 켜기/끄기를 한 화면에 모아요.
 * 설정 캐시는 useGuildSettings(SWR)를 공유해서 다른 탭과 중복 요청하지 않아요.
 */
export function ServerOverviewTab({ guildId, onSelectTab }: ServerOverviewTabProps) {
	const { settings, isLoading, error, saving, save, reload } = useGuildSettings(guildId);
	const usage = useGuildResource<GuildUsageResponse>(guildId, "/usage", { fetcher: usageFetcher });
	const [pendingModule, setPendingModule] = useState<BotModuleId | null>(null);

	if (isLoading || (!settings && !error)) return <PanelLoading label="서버 개요 불러오는 중…" />;
	if (error) return <PanelError error={error} onRetry={reload} />;
	if (!settings) return <PanelLoading label="서버 개요 불러오는 중…" />;

	const disabledModules = sanitizeDisabledModules(settings.disabledModules);
	const enabledCount = BOT_MODULES.length - disabledModules.length;
	const usageByModule = new Map(usage.data?.modules.map((item) => [item.id, item.uses]) ?? []);
	const topModule =
		usage.data && usage.data.totalUses > 0
			? [...usage.data.modules].sort((a, b) => b.uses - a.uses)[0]
			: null;

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
					description="이번 주 사용량과 모듈 상태를 한눈에 보고, 자주 쓰는 설정으로 바로 이동해요."
				/>

				{/* 요약 지표 3칸 */}
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
					<div className="rounded-control bg-surface-2 p-4">
						<p className="text-xs font-medium text-muted-foreground">
							이번 주 사용 ({usage.data?.usageDays ?? 7}일)
						</p>
						{usage.isLoading ? (
							<Skeleton className="mt-2 h-7 w-20" />
						) : usage.error ? (
							<p className="mt-1.5 text-sm font-semibold text-muted-foreground">불러오지 못했어요</p>
						) : (
							<p className="mt-1 text-2xl font-black tabular-nums text-primary-text">
								{(usage.data?.totalUses ?? 0).toLocaleString("ko-KR")}
								<span className="ml-1 text-xs font-semibold text-muted-foreground">회</span>
							</p>
						)}
					</div>

					<div className="rounded-control bg-surface-2 p-4">
						<p className="text-xs font-medium text-muted-foreground">켜진 모듈</p>
						<p className="mt-1 text-2xl font-black tabular-nums text-primary-text">
							{enabledCount}
							<span className="ml-1 text-xs font-semibold text-muted-foreground">/ {BOT_MODULES.length}</span>
						</p>
					</div>

					<div className="rounded-control bg-surface-2 p-4">
						<p className="text-xs font-medium text-muted-foreground">가장 많이 쓴 모듈</p>
						{usage.isLoading ? (
							<Skeleton className="mt-2 h-7 w-24" />
						) : topModule ? (
							<p className="mt-1 truncate text-lg font-black text-foreground">
								<span aria-hidden className="mr-1.5">
									{topModule.emoji}
								</span>
								{topModule.label}
								<span className="ml-1.5 text-xs font-semibold tabular-nums text-muted-foreground">
									{topModule.uses.toLocaleString("ko-KR")}회
								</span>
							</p>
						) : (
							<p className="mt-1.5 text-sm font-semibold text-muted-foreground">아직 기록 없음</p>
						)}
					</div>
				</div>

				{/* 사용량 조회 오류 시 부분 재시도 */}
				{usage.error && (
					<div className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-surface-2 px-4 py-3 text-xs text-muted-foreground">
						<span>최근 7일 사용량을 불러오지 못했어요.</span>
						<Button variant="ghost" size="sm" onClick={() => void usage.mutate()}>
							<RotateCcw size={13} aria-hidden />
							다시 시도
						</Button>
					</div>
				)}

				{/* 빠른 작업 */}
				<section aria-label="빠른 작업" className="space-y-3">
					<SectionLabel>빠른 작업</SectionLabel>
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
						<button
							type="button"
							onClick={() => onSelectTab("channels")}
							className="group flex min-h-11 items-start justify-between gap-3 rounded-control bg-surface-2 p-4 text-left transition-colors duration-fast hover:bg-surface-3 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
						>
							<div className="min-w-0 space-y-1">
								<p className="flex items-center gap-2 text-sm font-bold text-foreground">
									<Hash size={15} aria-hidden className="shrink-0 text-primary-text" />
									고정 채널 설정
								</p>
								<p className="text-xs text-muted-foreground">음악·카운팅·TTS 전용 채널 지정</p>
							</div>
							<ArrowRight size={15} aria-hidden className="mt-0.5 shrink-0 text-muted-foreground transition-transform duration-fast group-hover:translate-x-0.5" />
						</button>

						<Link
							href={`/player/${guildId}`}
							className="group flex min-h-11 items-start justify-between gap-3 rounded-control bg-surface-2 p-4 text-left transition-colors duration-fast hover:bg-surface-3 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
						>
							<div className="min-w-0 space-y-1">
								<p className="flex items-center gap-2 text-sm font-bold text-foreground">
									<Play size={15} aria-hidden className="shrink-0 text-primary-text" />
									플레이어 열기
								</p>
								<p className="text-xs text-muted-foreground">웹에서 재생과 대기열을 바로 조작</p>
							</div>
							<ExternalLink size={15} aria-hidden className="mt-0.5 shrink-0 text-muted-foreground" />
						</Link>

						<button
							type="button"
							onClick={() => onSelectTab("ticket")}
							className="group flex min-h-11 items-start justify-between gap-3 rounded-control bg-surface-2 p-4 text-left transition-colors duration-fast hover:bg-surface-3 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
						>
							<div className="min-w-0 space-y-1">
								<p className="flex items-center gap-2 text-sm font-bold text-foreground">
									<Ticket size={15} aria-hidden className="shrink-0 text-primary-text" />
									티켓 패널 게시
								</p>
								<p className="text-xs text-muted-foreground">문의 패널을 채널에 올리고 관리</p>
							</div>
							<ArrowRight size={15} aria-hidden className="mt-0.5 shrink-0 text-muted-foreground transition-transform duration-fast group-hover:translate-x-0.5" />
						</button>
					</div>
				</section>
			</Card>

			{/* 모듈 카드 */}
			<Card padding="lg" className="gap-5">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<div className="space-y-0.5">
						<h2 className="text-base font-bold text-foreground">모듈 상태</h2>
						<p className="text-xs text-muted-foreground">
							스위치를 누르면 바로 저장돼요. 꺼진 모듈은 사이드바에서 흐리게 표시돼요.
						</p>
					</div>
					<Button variant="ghost" size="sm" onClick={() => onSelectTab("modules")}>
						모듈 설정 보기
						<ArrowRight size={14} aria-hidden />
					</Button>
				</div>

				<ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					{BOT_MODULES.map((module) => {
						const enabled = !isModuleDisabled(disabledModules, module.id);
						const weeklyUses = usageByModule.get(module.id);
						const titleId = `overview-module-${module.id}-title`;
						return (
							<li
								key={module.id}
								className={cn(
									"flex items-start justify-between gap-3 rounded-control bg-surface-2 p-4 transition-opacity duration-fast",
									!enabled && "opacity-65",
								)}
							>
								<div className="min-w-0 space-y-1.5">
									<div className="flex flex-wrap items-center gap-1.5">
										<p id={titleId} className="text-sm font-bold text-foreground">
											<span aria-hidden className="mr-1.5">
												{module.emoji}
											</span>
											{module.label}
										</p>
										{!module.toggleable && (
											<Badge variant="secondary" size="sm">
												항상 켜짐
											</Badge>
										)}
										{weeklyUses !== undefined && weeklyUses > 0 && (
											<Badge variant="primary" size="sm" className="tabular-nums">
												주간 {weeklyUses.toLocaleString("ko-KR")}회
											</Badge>
										)}
									</div>
									<p className="text-xs text-muted-foreground">{module.description}</p>
								</div>
								<div className="shrink-0 pt-0.5">
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
