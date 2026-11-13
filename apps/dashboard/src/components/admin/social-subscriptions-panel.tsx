"use client";

import { useState } from "react";
import { Bell, Search, Settings2, Trash2 } from "lucide-react";
import useSWR from "swr";

import { type AdminSocialSubscription,SocialEditDialog } from "@/components/admin/social-edit-dialog";
import { EmptyState } from "@/components/primitives/empty-state";
import { PanelHeader, RetryLink, WarningBox } from "@/components/servers/settings-shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SkeletonCard } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { notifyApiError } from "@/lib/notify";
import { createApiFetcher } from "@/lib/swr";

const socialFetcher = createApiFetcher<{ subscriptions: AdminSocialSubscription[] }>("소셜 구독 목록을 불러오지 못했어요.");

export function SocialSubscriptionsPanel() {
	const [query, setQuery] = useState("");
	const [statusFilter, setStatusFilter] = useState<string>("all");
	const [editingSub, setEditingSub] = useState<AdminSocialSubscription | null>(null);
	const [busyId, setBusyId] = useState<string | null>(null);

	const params = new URLSearchParams();
	if (query.trim()) params.set("q", query.trim());
	if (statusFilter !== "all") params.set("status", statusFilter);
	const swrKey = `/api/admin/social${params.toString() ? `?${params.toString()}` : ""}`;

	const { data, error, isLoading, mutate } = useSWR<{ subscriptions: AdminSocialSubscription[] }>(
		swrKey,
		socialFetcher,
	);

	const subscriptions = data?.subscriptions ?? [];

	async function quickUpdateStatus(subId: string, nextStatus: "active" | "disabled") {
		setBusyId(subId);
		try {
			const res = await fetch(`/api/admin/social/${subId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ status: nextStatus }),
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body?.error ?? "구독 상태 변경에 실패했어요.");
				return;
			}
			await mutate();
			toast.success(nextStatus === "active" ? "구독을 정상(active) 상태로 복구했어요." : "구독을 일시정지했어요.");
		} catch (err) {
			notifyApiError(err, "구독 상태 변경에 실패했어요.");
		} finally {
			setBusyId(null);
		}
	}

	async function deleteSubscription(subId: string) {
		setBusyId(subId);
		try {
			const res = await fetch(`/api/admin/social/${subId}`, { method: "DELETE" });
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				toast.error(body?.error ?? "구독 삭제에 실패했어요.");
				return;
			}
			await mutate();
			toast.success("소셜 알림 구독을 삭제했어요.");
		} catch (err) {
			notifyApiError(err, "구독 삭제에 실패했어요.");
		} finally {
			setBusyId(null);
		}
	}

	return (
		<div className="space-y-6">
			<Card padding="md" className="space-y-5">
				<PanelHeader
					icon={<Bell size={20} />}
					title="소셜 알림 구독 전역 관리"
					description="유튜브·치지직·트위치 알림 구독의 배달 상태(active/failed/disabled)와 메시지 템플릿을 관리해요."
				/>

				<div className="flex flex-col gap-3 sm:flex-row">
					<InputGroup className="flex-1">
						<InputGroupAddon>
							<Search size={16} />
						</InputGroupAddon>
						<InputGroupInput
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="채널명, 플랫폼 ID, 서버 ID 검색..."
							aria-label="소셜 알림 검색"
						/>
					</InputGroup>

					<Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
						<SelectTrigger className="w-44">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">전체 상태 (all)</SelectItem>
							<SelectItem value="active">정상 (active)</SelectItem>
							<SelectItem value="failed">배달 실패 (failed)</SelectItem>
							<SelectItem value="disabled">일시정지 (disabled)</SelectItem>
						</SelectContent>
					</Select>
				</div>

				{isLoading && !data ? (
					<div className="space-y-2">
						<SkeletonCard className="h-20" />
						<SkeletonCard className="h-20" />
					</div>
				) : error && !data ? (
					<WarningBox>
						소셜 알림 구독 목록을 불러오지 못했어요. ({error.message}) <RetryLink onRetry={() => void mutate()} />
					</WarningBox>
				) : subscriptions.length === 0 ? (
					<EmptyState
						icon={Bell}
						size="sm"
						title="조건에 맞는 소셜 알림 구독이 없어요."
						description="필터나 검색어를 변경해 보세요."
					/>
				) : (
					<div className="divide-y divide-border-subtle rounded-card bg-surface-2">
						{subscriptions.map((sub) => (
							<div
								key={sub.id}
								className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center"
							>
								<div className="min-w-0 space-y-1">
									<div className="flex flex-wrap items-center gap-2">
										<Badge
											variant={
												sub.status === "active"
													? "success"
													: sub.status === "failed"
														? "danger"
														: "secondary"
											}
											size="sm"
										>
											{sub.status}
										</Badge>
										<Badge variant="outline" size="sm">
											{sub.platform}
										</Badge>
										<span className="font-bold text-foreground">{sub.sourceName}</span>
										<span className="font-mono text-xs text-muted-foreground">({sub.sourcePlatformId})</span>
									</div>
									<p className="font-mono text-xs text-muted-foreground">
										서버: {sub.guildId} · 알림 채널: {sub.targetChannelId}
									</p>
								</div>

								<div className="flex shrink-0 flex-wrap items-center gap-2">
									{sub.status !== "active" ? (
										<Button
											variant="secondary"
											size="sm"
											loading={busyId === sub.id}
											onClick={() => void quickUpdateStatus(sub.id, "active")}
										>
											정상 복구
										</Button>
									) : (
										<Button
											variant="ghost"
											size="sm"
											loading={busyId === sub.id}
											onClick={() => void quickUpdateStatus(sub.id, "disabled")}
										>
											일시정지
										</Button>
									)}
									<Button
										variant="secondary"
										size="sm"
										icon={<Settings2 size={14} />}
										onClick={() => setEditingSub(sub)}
									>
										수정
									</Button>
									<Button
										variant="danger"
										size="sm"
										loading={busyId === sub.id}
										icon={<Trash2 size={14} />}
										onClick={() => void deleteSubscription(sub.id)}
									>
										삭제
									</Button>
								</div>
							</div>
						))}
					</div>
				)}
			</Card>

			{editingSub && (
				<SocialEditDialog
					sub={editingSub}
					open={Boolean(editingSub)}
					onOpenChange={(open) => {
						if (!open) setEditingSub(null);
					}}
					onSaved={() => void mutate()}
				/>
			)}
		</div>
	);
}
