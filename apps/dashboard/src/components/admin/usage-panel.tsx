"use client";

import { BarChart3, PlayCircle, RefreshCw, Sparkles } from "lucide-react";
import useSWR from "swr";

import { StatCard } from "@/components/data/stat-card";
import { EmptyState } from "@/components/primitives/empty-state";
import { PanelHeader, RetryLink, WarningBox } from "@/components/servers/settings-shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SkeletonCard } from "@/components/ui/skeleton";
import { createApiFetcher } from "@/lib/swr";
import type { AdminUsageResponse } from "@/lib/usage-summary";

const usageFetcher = createApiFetcher<AdminUsageResponse>("사용 지표를 불러오지 못했어요.");

const PLAYBACK_LABELS: Record<string, string> = {
	track_start: "재생 시작",
	track_error: "재생 오류",
	track_stuck: "재생 멈춤",
	playback_abort: "재생 중단",
};

const formatCount = (n: number) => n.toLocaleString("ko-KR");

export function UsagePanel() {
	const { data, error, isLoading, mutate } = useSWR<AdminUsageResponse>("/api/admin/usage", usageFetcher, {
		refreshInterval: 60_000,
	});

	if (isLoading && !data) {
		return (
			<div className="space-y-6">
				<SkeletonCard className="h-40" />
				<SkeletonCard className="h-64" />
			</div>
		);
	}

	if (error && !data) {
		return (
			<WarningBox>
				사용 지표를 불러오지 못했어요. ({error.message}) <RetryLink onRetry={() => void mutate()} />
			</WarningBox>
		);
	}

	if (!data) return null;

	const { activation, modules, playback, activationDays, usageDays } = data;
	const playbackStarts = playback.find((p) => p.type === "track_start")?.count ?? 0;

	return (
		<div className="space-y-8">
			<Card padding="md" className="space-y-6">
				<PanelHeader
					icon={<Sparkles size={20} />}
					title="신규 서버 활성화"
					description={`최근 ${activationDays}일 동안 들어온 서버 중 24시간 안에 기능을 하나라도 쓴 서버예요.`}
					action={
						<Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={() => void mutate()}>
							새로고침
						</Button>
					}
				/>
				<div className="grid gap-4 sm:grid-cols-3">
					<StatCard icon={Sparkles} label="들어온 서버" value={activation.joined} sub={`지금도 남아 있는 서버 ${formatCount(activation.stillIn)}개`} />
					<StatCard icon={Sparkles} label="24시간 안에 사용" value={activation.activated} />
					<StatCard
						icon={Sparkles}
						label="활성화율"
						value={activation.rate === null ? "-" : `${Math.round(activation.rate * 100)}%`}
						sub={activation.rate === null ? "아직 들어온 서버가 없어요" : undefined}
					/>
				</div>
			</Card>

			<Card padding="md" className="space-y-4">
				<PanelHeader
					icon={<BarChart3 size={20} />}
					title="모듈별 사용량 (익명)"
					description={`최근 ${usageDays}일(KST) 동안 전체 서버에서 익명으로 집계된 모듈별 사용 횟수예요.`}
				/>
				<div className="divide-y divide-border-subtle rounded-card bg-surface-2">
					{modules.map((m) => (
						<div key={m.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
							<span className="font-medium text-foreground">
								<span aria-hidden className="mr-2">
									{m.emoji}
								</span>
								{m.label}
							</span>
							<span className="tabular-nums text-muted-foreground">
								<span className="font-semibold text-foreground">{formatCount(m.uses)}</span>회
							</span>
						</div>
					))}
				</div>
			</Card>

			<Card padding="md" className="space-y-4">
				<PanelHeader
					icon={<PlayCircle size={20} />}
					title="재생 결과"
					description={`최근 ${usageDays}일(KST) 동안의 재생 시작과 실패 유형별 횟수예요.`}
				/>
				{playback.length === 0 ? (
					<EmptyState size="sm" title="아직 재생 기록이 없어요" />
				) : (
					<div className="divide-y divide-border-subtle rounded-card bg-surface-2">
						{playback.map((p) => (
							<div key={p.type} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
								<span className="font-medium text-foreground">{PLAYBACK_LABELS[p.type] ?? p.type}</span>
								<span className="tabular-nums text-muted-foreground">
									{formatCount(p.count)}회
									{p.type !== "track_start" && playbackStarts > 0 && ` · 시작 대비 ${((p.count / playbackStarts) * 100).toFixed(1)}%`}
								</span>
							</div>
						))}
					</div>
				)}
			</Card>
		</div>
	);
}
