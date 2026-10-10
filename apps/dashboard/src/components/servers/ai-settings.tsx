"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Check, Globe, Hash, Loader2, PowerOff, Trash2 } from "lucide-react";

import { useToast } from "@/components/feedback/toast";
import { Select, type SelectOption } from "@/components/overlay/select";
import { Button } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import { Field } from "@/components/primitives/field";
import { useGuildChannels } from "@/hooks/use-guild-settings";
import { ApiError, toApiError, toError } from "@/lib/api-error";
import type { AiMode, AiPolicy } from "@/types/settings";

import { InfoBox, PanelError, PanelHeader, PanelLoading, SaveBar, WarningBox } from "./settings-shared";

const MODE_CARDS: Array<{ value: AiMode; label: string; description: string; icon: React.ReactNode }> = [
	{
		value: "all",
		label: "모든 채널",
		description: "멘션하면 어떤 텍스트 채널에서든 답해요. (@everyone 제외)",
		icon: <Globe size={16} />,
	},
	{
		value: "channels",
		label: "특정 채널",
		description: "아래에서 선택한 채널에서만 답해요.",
		icon: <Hash size={16} />,
	},
	{
		value: "off",
		label: "끄기",
		description: "이 서버에서는 AI 채팅을 사용하지 않아요.",
		icon: <PowerOff size={16} />,
	},
];

function AiSettingsPanel({ guildId }: { guildId: string }) {
	const toast = useToast();
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [policy, setPolicy] = useState<AiPolicy | null>(null);
	const [mode, setMode] = useState<AiMode>("all");
	const [channelIds, setChannelIds] = useState<string[]>([]);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [loadError, setLoadError] = useState<ApiError | null>(null);
	const [retryToken, setRetryToken] = useState(0);
	const confirmTimerRef = useRef<number | null>(null);

	// 특정 채널 모드가 활성일 때만 채널 목록을 요청해요
	const { channels, error: channelsError, reload: reloadChannels } = useGuildChannels(guildId, mode === "channels");

	useEffect(() => {
		return () => {
			if (confirmTimerRef.current !== null) window.clearTimeout(confirmTimerRef.current);
		};
	}, []);

	const applyPolicy = useCallback((next: AiPolicy) => {
		setPolicy(next);
		setMode(next.mode);
		setChannelIds(next.channelIds);
	}, []);

	useEffect(() => {
		let cancelled = false;
		setLoadError(null);
		(async () => {
			try {
				const res = await fetch(`/api/servers/${guildId}/ai`, { cache: "no-store" });
				if (!res.ok) throw await toApiError(res, "AI 설정을 불러오지 못했어요.");
				const data: AiPolicy = await res.json();
				if (!cancelled) applyPolicy(data);
			} catch (error) {
				if (!cancelled) setLoadError(toError(error, "AI 설정을 불러오지 못했어요."));
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [guildId, applyPolicy, retryToken]);

	const reportError = (error: unknown, fallback: string) => {
		const apiError = toError(error, fallback);
		toast.error(apiError.message, apiError.retryable ? "잠시 후 다시 시도해 주세요." : undefined);
	};

	const dirty =
		policy !== null && (mode !== policy.mode || JSON.stringify(channelIds) !== JSON.stringify(policy.channelIds));

	const handleSave = async () => {
		setSaving(true);
		try {
			const res = await fetch(`/api/servers/${guildId}/ai`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					mode,
					channelIds,
				}),
			});
			if (!res.ok) throw await toApiError(res, "저장에 실패했어요.");
			applyPolicy((await res.json()) as AiPolicy);
			toast.success("AI 설정을 저장했어요.", "봇이 곧 새 설정을 적용해요.");
		} catch (error) {
			reportError(error, "저장에 실패했어요.");
		} finally {
			setSaving(false);
		}
	};

	const handleDeleteHistory = async () => {
		if (!confirmDelete) {
			if (confirmTimerRef.current !== null) window.clearTimeout(confirmTimerRef.current);
			setConfirmDelete(true);
			confirmTimerRef.current = window.setTimeout(() => setConfirmDelete(false), 4000);
			return;
		}
		setConfirmDelete(false);
		setDeleting(true);
		try {
			const res = await fetch(`/api/servers/${guildId}/ai/history`, { method: "DELETE" });
			if (!res.ok) throw await toApiError(res, "기록 삭제에 실패했어요.");
			setPolicy((prev) => (prev ? { ...prev, historyCount: 0 } : prev));
			toast.success("이 서버의 AI 대화 기록을 삭제했어요.");
		} catch (error) {
			reportError(error, "기록 삭제에 실패했어요.");
		} finally {
			setDeleting(false);
		}
	};

	if (loading) return <PanelLoading label="AI 설정 불러오는 중…" />;
	if (loadError) return <PanelError error={loadError} onRetry={() => { setLoading(true); setRetryToken((t) => t + 1); }} />;

	const categories = new Map((channels ?? []).filter((c) => c.type === 4).map((c) => [c.id, c.name]));
	const textChannels = (channels ?? []).filter((c) => c.type === 0 || c.type === 5);
	const channelOptions: SelectOption[] = textChannels.map((c) => ({
		value: c.id,
		label: `# ${c.name}`,
		group: c.parentId ? (categories.get(c.parentId) ?? "기타") : "카테고리 없음",
	}));
	// DB에는 남아 있지만 Discord에서 삭제된 채널도 목록에 보여 제거할 수 있게 해요
	const knownIds = new Set(textChannels.map((c) => c.id));
	for (const id of channelIds) {
		if (!knownIds.has(id)) channelOptions.push({ value: id, label: `${id} (삭제된 채널)`, group: "삭제된 채널" });
	}

	return (
		<Card padding="lg" className="gap-6">
			<PanelHeader
				icon={<Bot className="h-5 w-5" />}
				title="AI 채팅 설정"
				description="응답할 채널 범위와 지침을 관리해요."
				action={
					<Button
						variant="icon"
						size="sm"
						aria-label="설정 새로고침"
						icon={<Loader2 size={16} className={loading ? "animate-spin" : ""} />}
						onClick={() => {
							setLoading(true);
							setRetryToken((t) => t + 1);
						}}
					/>
				}
			/>

			{/* 모드 선택 */}
			<div role="radiogroup" aria-label="AI 채팅 모드" className="grid gap-3 sm:grid-cols-3">
				{MODE_CARDS.map((card) => {
					const active = mode === card.value;
					return (
						<button
							key={card.value}
							type="button"
							role="radio"
							aria-checked={active}
							disabled={saving}
							onClick={() => setMode(card.value)}
						className={`relative rounded-card border p-4 text-left transition-colors duration-fast ${
							active
								? "border-primary/60 bg-primary/10"
								: "border-border-subtle bg-surface-2 hover:border-border hover:bg-surface-3"
						}`}
						>
							<span className="flex items-center gap-2 text-sm font-bold text-foreground">
								<span className={active ? "text-primary-text" : "text-muted-foreground"}>{card.icon}</span>
								{card.label}
							</span>
							<span className="mt-1 block text-xs text-muted-foreground">{card.description}</span>
							{active && (
								<span className="absolute right-3 top-3 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-control text-primary-foreground">
									<Check size={12} />
								</span>
							)}
						</button>
					);
				})}
			</div>

			{/* 특정 채널 선택 */}
			{mode === "channels" && (
				<div className="space-y-3">
					<Field
						label="허용 채널"
						description="선택한 텍스트 채널에서만 AI가 답해요. 여러 개를 고를 수 있어요."
					>
						<Select
							multiple
							searchable
							searchPlaceholder="채널 검색…"
							placeholder="채널을 선택해 주세요"
							options={channelOptions}
							value={channelIds}
							onChange={setChannelIds}
							disabled={saving || channels === null}
						/>
					</Field>
					{channelsError && (
						<WarningBox>
							채널 목록을 불러오지 못했어요. ({channelsError.message}){" "}
							<button type="button" className="font-semibold underline" onClick={reloadChannels}>
								다시 시도
							</button>
						</WarningBox>
					)}
					{!channelsError && channelIds.length === 0 && (
						<WarningBox>허용 채널이 0개면 어디서도 응답하지 않아요. 채널을 최소 1개 선택해 주세요.</WarningBox>
					)}
				</div>
			)}

			<InfoBox>
				<p>
					디스코드에서 <span className="font-semibold text-foreground">/채팅설정</span> 커맨드로도 바꿀 수 있어요.
				</p>
				<p>
					저장된 대화 기록: <span className="font-semibold text-foreground">{policy?.historyCount ?? 0}</span>개 채널 · 허용 채널{" "}
					<span className="font-semibold text-foreground">{channelIds.length}</span>개
				</p>
			</InfoBox>

			<SaveBar dirty={dirty} saving={saving} onSave={handleSave}>
				<Button
					variant="danger"
					loading={deleting}
					disabled={(policy?.historyCount ?? 0) === 0}
					icon={deleting ? undefined : <Trash2 size={16} />}
					onClick={handleDeleteHistory}
					className={confirmDelete ? "ring-2 ring-destructive/50" : ""}
				>
					{confirmDelete ? "정말 삭제할까요?" : "대화 기록 전체 삭제"}
				</Button>
			</SaveBar>
		</Card>
	);
}

export function AiSettings({ guildId }: { guildId: string }) {
	return <AiSettingsPanel guildId={guildId} />;
}
