"use client";

import { useState } from "react";
import { SOCIAL_PLATFORM_LABELS } from "@sirubot/utils/social";
import { Bell, Pause, PencilLine, Play, Plus, Trash2 } from "lucide-react";

import { EmptyState } from "@/components/primitives/empty-state";
import { InfoBox, PanelError, PanelHeader, PanelLoading, WarningBox } from "@/components/servers/settings-shared";
import { AddSubscriptionForm } from "@/components/servers/social/add-subscription-form";
import { SAMPLE_URLS, TemplateEditor, type TemplateSample } from "@/components/servers/social/template-editor";
import { WebhookProfileSection } from "@/components/servers/social/webhook-profile-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { useBotProfile } from "@/hooks/use-bot-profile";
import { useConfirmDelete } from "@/hooks/use-confirm-delete";
import { useGuildChannels } from "@/hooks/use-guild-settings";
import { useSocialAlerts } from "@/hooks/use-social-alerts";
import type { SocialPlatform, SocialSubscription, SocialSubscriptionStatus } from "@/types/social";

const PLATFORM_BADGE: Record<SocialPlatform, "danger" | "info" | "discord"> = {
	youtube: "danger",
	chzzk: "info",
	twitch: "discord"
};

const STATUS_BADGE: Record<SocialSubscriptionStatus, "success" | "danger" | "default"> = {
	active: "success",
	failed: "danger",
	disabled: "default"
};

const STATUS_LABEL: Record<SocialSubscriptionStatus, string> = {
	active: "정상",
	failed: "전송 실패",
	disabled: "일시정지"
};

/** 미리보기 샘플: 소스 이름만 실제 값으로 쓰고 URL은 플랫폼 자리 표시로 보내요 (R-38) */
export function sampleFor(subscription: SocialSubscription): TemplateSample {
	if (subscription.platform === "youtube") {
		return { platform: "youtube", sourceId: subscription.sourcePlatformId, title: "새 영상 제목", url: SAMPLE_URLS.youtube, author: subscription.sourceName };
	}
	if (subscription.platform === "twitch") {
		return { platform: "twitch", sourceId: subscription.sourcePlatformId, title: `${subscription.sourceName} 방송 시작!`, url: SAMPLE_URLS.twitch, author: subscription.sourceName };
	}
	return { platform: "chzzk", sourceId: subscription.sourcePlatformId, title: `${subscription.sourceName} 방송 시작!`, url: SAMPLE_URLS.chzzk, author: subscription.sourceName };
}

export default function SocialAlertsSettings({ guildId, visible }: { guildId: string; visible?: boolean }) {
	const enabled = visible !== false;
	const { subscriptions, isLoading, error, reload, updateSubscription, removeSubscription } = useSocialAlerts(guildId, enabled);
	const { channels } = useGuildChannels(guildId, enabled);
	// 웹훅 프로필 사진 폴백 미리보기용 — 서버(길드) 전용 → 전역 봇 프로필 사진 순서 (봇 프로필 설정과 동일)
	const { profile: botProfile } = useBotProfile(guildId);

	const [showAdd, setShowAdd] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [draft, setDraft] = useState("");
	const [nameDraft, setNameDraft] = useState("");
	const [avatarDraft, setAvatarDraft] = useState<string | null>(null);
	const [showThumbDraft, setShowThumbDraft] = useState(true);
	// 첫 클릭 무장 → 4초 안에 다시 클릭해야 삭제돼요 (ai·커스텀 명령어 패널과 같은 2클릭 삭제)
	const { armedId: confirmingId, request: requestDelete } = useConfirmDelete();
	const [busyId, setBusyId] = useState<string | null>(null);
	const channelName = (id: string) => channels?.find((channel) => channel.id === id)?.name ?? null;
	const editingSub = subscriptions?.find((subscription) => subscription.id === editingId) ?? null;

	const toggleStatus = async (subscription: SocialSubscription) => {
		const next: SocialSubscriptionStatus = subscription.status === "disabled" ? "active" : "disabled";
		setBusyId(subscription.id);
		const result = await updateSubscription(subscription.id, { status: next });
		setBusyId(null);
		if (result.ok) toast.success(next === "disabled" ? "알림을 일시정지했어요." : "알림을 다시 켰어요.");
		else toast.error("상태를 변경하지 못했어요.", result.error);
	};

	const startEdit = (subscription: SocialSubscription) => {
		setEditingId(subscription.id);
		setDraft(subscription.messageTemplate ?? "");
		setNameDraft(subscription.webhookName ?? "");
		setAvatarDraft(subscription.webhookAvatarUrl ?? null);
		setShowThumbDraft(subscription.showThumbnail);
	};

	const saveSettings = async (subscription: SocialSubscription) => {
		setBusyId(subscription.id);
		const result = await updateSubscription(subscription.id, {
			messageTemplate: draft.trim() ? draft : null,
			webhookName: nameDraft.trim() ? nameDraft.trim() : null,
			webhookAvatarUrl: avatarDraft,
			showThumbnail: showThumbDraft
		});
		setBusyId(null);
		if (result.ok) {
			toast.success("알림 설정을 저장했어요.", "비운 항목은 기본값으로 보내요.");
			setEditingId(null);
		} else {
			toast.error("알림 설정을 저장하지 못했어요.", result.error);
		}
	};

	const remove = async (subscription: SocialSubscription) => {
		setBusyId(subscription.id);
		const result = await removeSubscription(subscription.id);
		setBusyId(null);
		if (result.ok) toast.success("알림을 삭제했어요.");
		else toast.error("알림을 삭제하지 못했어요.", result.error);
	};

	if (isLoading) return <PanelLoading label="알림 구독 목록을 불러오는 중…" />;
	if (error) return <PanelError error={error} onRetry={reload} />;

	return (
		<Card padding="lg" className="gap-6 overflow-visible">
			<PanelHeader
				icon={<Bell className="h-5 w-5" />}
				title="소셜 알림"
				description="유튜브 업로드·치지직 방송 시작·트위치 방송 시작 알림을 디스코드 채널로 보내요."
				action={
					<Button variant="primary" size="sm" icon={<Plus size={16} />} onClick={() => setShowAdd((value) => !value)}>
						{showAdd ? "추가 닫기" : "알림 추가"}
					</Button>
				}
			/>

			{showAdd && <AddSubscriptionForm guildId={guildId} onDone={() => setShowAdd(false)} />}

			{subscriptions && subscriptions.length === 0 && !showAdd && (
				<EmptyState
					icon={Bell}
					title="등록된 알림이 없어요"
					description="유튜브 업로드와 치지직·트위치 방송 시작을 디스코드 채널로 보내는 알림을 만들어 보세요."
					action={
						<Button variant="primary" icon={<Plus size={16} />} onClick={() => setShowAdd(true)}>
							알림 추가
						</Button>
					}
				/>
			)}

			{subscriptions && subscriptions.length > 0 && (
				<ul className="space-y-2">
					{subscriptions.map((subscription) => {
						const confirming = confirmingId === subscription.id;
						const busy = busyId === subscription.id;
						const target = channelName(subscription.targetChannelId);
						const effectiveAvatar = subscription.webhookAvatarUrl ?? botProfile?.guildAvatarUrl ?? botProfile?.globalAvatarUrl;
						const metaParts: string[] = [];
						if (subscription.webhookName) metaParts.push(`프로필: ${subscription.webhookName}`);
						if (subscription.webhookAvatarUrl) metaParts.push("커스텀 프로필 사진");
						if (!subscription.showThumbnail) metaParts.push("섬네일 끔");
						if (subscription.messageTemplate) metaParts.push(subscription.messageTemplate);

						return (
							<li key={subscription.id} className="flex flex-col gap-2 rounded-card bg-surface-2 px-4 py-3">
								<div className="flex items-center gap-3">
									<span className="relative inline-flex h-10 w-10 shrink-0 overflow-hidden rounded-full bg-surface-2 ring-2 ring-border-subtle">
										{effectiveAvatar ? (
											// eslint-disable-next-line @next/next/no-img-element
											<img
												src={effectiveAvatar}
												alt={`${subscription.sourceName} 웹훅 프로필 사진`}
												className="h-full w-full object-cover"
											/>
										) : (
											<Bell className="m-auto h-5 w-5 text-muted-foreground" aria-hidden />
										)}
									</span>

									<div className="min-w-0 flex-1">
										<div className="flex flex-wrap items-center gap-2">
											<Badge variant={PLATFORM_BADGE[subscription.platform]} size="sm">
												{SOCIAL_PLATFORM_LABELS[subscription.platform]}
											</Badge>
											<span className="min-w-0 truncate text-sm font-bold text-foreground">{subscription.sourceName}</span>
											<span className="min-w-0 truncate text-xs font-medium text-muted-foreground">
												→ #{target ?? "알 수 없는 채널"}
											</span>
											<Badge variant={STATUS_BADGE[subscription.status]} size="sm" dot>
												{STATUS_LABEL[subscription.status]}
											</Badge>
										</div>
										<p className="truncate text-xs text-muted-foreground">
											{metaParts.length > 0 ? metaParts.join(" · ") : "기본 프로필"}
										</p>
									</div>

									<div className="flex shrink-0 items-center gap-1">
										<Button
											variant="icon"
											size="sm"
											aria-label={`${subscription.sourceName} 알림 ${subscription.status === "disabled" ? "재개" : "일시정지"}`}
											disabled={busy}
											onClick={() => void toggleStatus(subscription)}
										>
											{subscription.status === "disabled" ? <Play size={14} /> : <Pause size={14} />}
										</Button>
										<Button
											variant="icon"
											size="sm"
											aria-label={`${subscription.sourceName} 알림 설정 편집하기`}
											disabled={busy}
											onClick={() => startEdit(subscription)}
										>
											<PencilLine size={14} />
										</Button>
										<Button
											variant="icon"
											size="sm"
											aria-label={`${subscription.sourceName} 알림 삭제`}
											disabled={busy}
											className={confirming ? "ring-2 ring-destructive/50" : undefined}
											icon={confirming ? <Trash2 size={14} className="text-destructive" /> : <Trash2 size={14} />}
											onClick={() => {
												if (requestDelete(subscription.id)) void remove(subscription);
											}}
										/>
									</div>
								</div>

								{subscription.status === "failed" && (
									<WarningBox>
										이 알림은 전송에 계속 실패하고 있어요. 웹훅이나 대상 채널이 삭제되었을 수 있어요. 채널을 확인한 뒤 알림을
										삭제하고 다시 추가해 주세요.
									</WarningBox>
								)}
							</li>
						);
					})}
				</ul>
			)}

			<Dialog open={editingSub !== null} onOpenChange={(open) => { if (!open) setEditingId(null); }}>
				<DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
					{editingSub && (
						<>
							<DialogHeader>
								<DialogTitle>{editingSub.sourceName} 알림 설정</DialogTitle>
							</DialogHeader>
							<WebhookProfileSection
								guildId={guildId}
								name={nameDraft}
								onNameChange={setNameDraft}
								avatarValue={avatarDraft}
								onAvatarChange={setAvatarDraft}
								showThumbnail={showThumbDraft}
								onShowThumbnailChange={setShowThumbDraft}
								fallbackGuildAvatarUrl={botProfile?.guildAvatarUrl ?? null}
								fallbackGlobalAvatarUrl={botProfile?.globalAvatarUrl ?? null}
								disabled={busyId === editingSub.id}
								surface="surface-2"
							/>
							<TemplateEditor guildId={guildId} value={draft} onChange={setDraft} sample={sampleFor(editingSub)} />
							<DialogFooter>
								<Button variant="secondary" size="sm" onClick={() => setEditingId(null)}>
									취소
								</Button>
								<Button variant="primary" size="sm" loading={busyId === editingSub.id} onClick={() => void saveSettings(editingSub)}>
									저장
								</Button>
							</DialogFooter>
						</>
					)}
				</DialogContent>
			</Dialog>

			<InfoBox>
				<p>
					알림은 봇이 채널에 웹훅을 만든 뒤에는 대시보드를 닫아도 계속 전송돼요. 알림을 없애려면 목록에서 삭제해 주세요.
				</p>
			</InfoBox>
		</Card>
	);
}
