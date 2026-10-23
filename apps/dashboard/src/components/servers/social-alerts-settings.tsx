"use client";

import { useState } from "react";
import { SOCIAL_PLATFORM_LABELS } from "@sirubot/utils/social";
import { Bell, Pause, PencilLine, Play, Plus, Trash2 } from "lucide-react";

import { EmptyState } from "@/components/primitives/empty-state";
import { Field } from "@/components/primitives/field";
import { InfoBox, PanelError, PanelHeader, PanelLoading, WarningBox } from "@/components/servers/settings-shared";
import { AddSubscriptionForm } from "@/components/servers/social/add-subscription-form";
import { TemplateEditor, type TemplateSample } from "@/components/servers/social/template-editor";
import { WebhookAvatarField } from "@/components/servers/social/webhook-avatar-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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

// 미리보기용 예시는 실제 영상·채널 주소로 오인되지 않게 예약 도메인(example.com)으로 통일해요
function sampleFor(subscription: SocialSubscription): TemplateSample {
	if (subscription.platform === "youtube") {
		return { platform: "youtube", sourceId: subscription.sourcePlatformId, title: "새 영상 제목", url: "https://www.example.com/video", author: subscription.sourceName };
	}
	if (subscription.platform === "twitch") {
		return { platform: "twitch", sourceId: subscription.sourcePlatformId, title: `${subscription.sourceName} 방송 시작!`, url: "https://www.example.com/live", author: subscription.sourceName };
	}
	return { platform: "chzzk", sourceId: subscription.sourcePlatformId, title: `${subscription.sourceName} 방송 시작!`, url: "https://www.example.com/live", author: subscription.sourceName };
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
						const editing = editingId === subscription.id;
						const confirming = confirmingId === subscription.id;
						const busy = busyId === subscription.id;
						const target = channelName(subscription.targetChannelId);

						return (
							<li key={subscription.id} className="flex flex-col gap-3 rounded-menu bg-surface-2 px-4 py-3">
								<div className="flex flex-wrap items-center gap-2">
									<Badge variant={PLATFORM_BADGE[subscription.platform]}>{SOCIAL_PLATFORM_LABELS[subscription.platform]}</Badge>
									<Badge variant={STATUS_BADGE[subscription.status]} dot>
										{STATUS_LABEL[subscription.status]}
									</Badge>
									<span className="min-w-0 truncate text-sm font-medium text-foreground">{subscription.sourceName}</span>
									<span className="text-sm text-muted-foreground">→ #{target ?? subscription.targetChannelId}</span>
									<span className="text-xs text-muted-foreground">{new Date(subscription.createdAt).toLocaleDateString("ko-KR")}</span>
									<div className="ml-auto flex items-center gap-1">
										<Button
											variant="icon"
											size="sm"
											aria-label={`${subscription.sourceName} 알림 ${subscription.status === "disabled" ? "재개" : "일시정지"}`}
											disabled={busy}
											className="pointer-coarse:h-11"
											onClick={() => void toggleStatus(subscription)}
										>
											{subscription.status === "disabled" ? <Play size={14} /> : <Pause size={14} />}
										</Button>
										<Button
											variant="icon"
											size="sm"
											aria-label={`${subscription.sourceName} 알림 설정 ${editing ? "편집 닫기" : "편집하기"}`}
											disabled={busy}
											className="pointer-coarse:h-11"
											onClick={() => (editing ? setEditingId(null) : startEdit(subscription))}
										>
											<PencilLine size={14} />
										</Button>
										<Button
											variant="icon"
											size="sm"
											aria-label={`${subscription.sourceName} 알림 삭제`}
											disabled={busy}
											className={`pointer-coarse:h-11 ${confirming ? "ring-2 ring-destructive/50" : ""}`}
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

								{!editing && subscription.messageTemplate && (
									<div className="rounded-control bg-surface-1 px-3 py-2 text-sm break-all whitespace-pre-wrap text-foreground">
										{subscription.messageTemplate}
									</div>
								)}

								{!editing && (subscription.webhookName || subscription.webhookAvatarUrl || !subscription.showThumbnail) && (
									<p className="text-xs text-muted-foreground">
										웹훅 표시: {subscription.webhookName ?? "기본"}
										{subscription.webhookAvatarUrl ? " · 커스텀 프로필 사진" : ""}
										{!subscription.showThumbnail ? " · 섬네일 이미지 없음" : ""}
									</p>
								)}

								{editing && (
									<div className="flex flex-col gap-3 border-t border-border-subtle pt-3">
										<TemplateEditor guildId={guildId} value={draft} onChange={setDraft} sample={sampleFor(subscription)} />
										<Field
											label="웹훅 표시명"
											htmlFor={`webhook-name-${subscription.id}`}
											description={`${nameDraft.length}/80 · 비우면 기본 이름으로 보내요. discord·clyde는 쓸 수 없어요 (Discord 규칙).`}
										>
											<Input
												id={`webhook-name-${subscription.id}`}
												value={nameDraft}
												onChange={(event) => setNameDraft(event.target.value)}
												placeholder="웹훅 표시명"
												maxLength={80}
												disabled={busy}
											/>
										</Field>
										<WebhookAvatarField
											guildId={guildId}
											value={avatarDraft}
											onChange={setAvatarDraft}
											fallbackGuildAvatarUrl={botProfile?.guildAvatarUrl ?? null}
											fallbackGlobalAvatarUrl={botProfile?.globalAvatarUrl ?? null}
											disabled={busy}
										/>
										<div className="flex flex-col gap-1.5">
											<Switch
												checked={showThumbDraft}
												onChange={setShowThumbDraft}
												label="방송 시작 섬네일 이미지 표시"
												labelPosition="right"
											/>
											<p className="text-xs text-muted-foreground">
												라이브 미리보기 이미지를 임베드에 넣어요. 트위치는 이미지가 없어 자동으로 생략돼요.
											</p>
										</div>
										<div className="flex justify-end gap-2">
											<Button size="sm" variant="secondary" className="pointer-coarse:h-11" onClick={() => setEditingId(null)}>
												취소
											</Button>
											<Button
												size="sm"
												variant="primary"
												loading={busy}
												className="pointer-coarse:h-11"
												onClick={() => void saveSettings(subscription)}
											>
												저장
											</Button>
										</div>
									</div>
								)}
							</li>
						);
					})}
				</ul>
			)}

			<InfoBox>
				<p>
					알림은 봇이 채널에 웹훅을 만든 뒤에는 대시보드를 닫아도 계속 전송돼요. 알림을 없애려면 목록에서 삭제해 주세요.
				</p>
			</InfoBox>
		</Card>
	);
}
