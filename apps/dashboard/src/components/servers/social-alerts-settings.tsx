"use client";

import { useState } from "react";
import { SOCIAL_PLATFORM_LABELS } from "@sirubot/utils/social";
import { Pause, PencilLine, Play, Plus, Trash2 } from "lucide-react";

import { InfoBox, PanelHeader, PanelLoading, WarningBox } from "@/components/servers/settings-shared";
import { AddSubscriptionForm } from "@/components/servers/social/add-subscription-form";
import { TemplateEditor, type TemplateSample } from "@/components/servers/social/template-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
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

function sampleFor(subscription: SocialSubscription): TemplateSample {
	if (subscription.platform === "youtube") {
		return { platform: "youtube", sourceId: subscription.sourcePlatformId, title: "새 영상 제목", url: "https://youtu.be/dQw4w9WgXcQ", author: subscription.sourceName };
	}
	if (subscription.platform === "twitch") {
		return { platform: "twitch", sourceId: subscription.sourcePlatformId, title: `${subscription.sourceName} 방송 시작!`, url: "https://www.twitch.tv/example", author: subscription.sourceName };
	}
	return { platform: "chzzk", sourceId: subscription.sourcePlatformId, title: `${subscription.sourceName} 방송 시작!`, url: "https://chzzk.naver.com/live/12345", author: subscription.sourceName };
}

export default function SocialAlertsSettings({ guildId, visible }: { guildId: string; visible?: boolean }) {
	const enabled = visible !== false;
	const { subscriptions, isLoading, error, reload, updateSubscription, removeSubscription } = useSocialAlerts(guildId, enabled);
	const { channels } = useGuildChannels(guildId, enabled);

	const [showAdd, setShowAdd] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [draft, setDraft] = useState("");
	const [nameDraft, setNameDraft] = useState("");
	const [avatarDraft, setAvatarDraft] = useState("");
	// 첫 클릭 무장 → "정말 삭제" 버튼으로 교체. 취소 버튼은 reset(), 4초 지나면 자동 해제
	const { armedId: confirmingId, request: requestDelete, reset: cancelConfirm } = useConfirmDelete();
	const [showThumbDraft, setShowThumbDraft] = useState(true);
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
		setAvatarDraft(subscription.webhookAvatarUrl ?? "");
		setShowThumbDraft(subscription.showThumbnail);
	};

	const saveSettings = async (subscription: SocialSubscription) => {
		setBusyId(subscription.id);
		const result = await updateSubscription(subscription.id, {
			messageTemplate: draft.trim() ? draft : null,
			webhookName: nameDraft.trim() ? nameDraft.trim() : null,
			webhookAvatarUrl: avatarDraft.trim() ? avatarDraft.trim() : null,
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
		if (result.ok) {
			toast.success("알림을 삭제했어요.");
			cancelConfirm();
		} else {
			toast.error("알림을 삭제하지 못했어요.", result.error);
		}
	};

	if (isLoading) return <PanelLoading label="알림 목록을 불러오는 중..." />;

	return (
		<section className="flex flex-col gap-4">
			<PanelHeader
				icon={<Pause size={16} />}
				title="소셜 알림"
				description="유튜브 업로드·치지직 방송 시작·트위치 방송 시작 알림을 디스코드 채널로 보내요."
				action={
					<Button size="sm" variant={showAdd ? "secondary" : "default"} onClick={() => setShowAdd((value) => !value)}>
						<Plus size={14} />
						{showAdd ? "닫기" : "알림 추가"}
					</Button>
				}
			/>

			{error && (
				<Card padding="lg" className="flex flex-wrap items-center gap-3">
					<span className="text-destructive text-sm">알림 목록을 불러오지 못했어요. ({error.message})</span>
					<Button size="sm" variant="secondary" onClick={() => void reload()}>
						다시 시도
					</Button>
				</Card>
			)}

			{showAdd && <AddSubscriptionForm guildId={guildId} onDone={() => setShowAdd(false)} />}

			{subscriptions && subscriptions.length === 0 && !showAdd && (
				<InfoBox>
					아직 등록된 알림이 없어요. &apos;알림 추가&apos;로 유튜브·치지직·트위치 알림을 만들어 보세요. 알림은 봇이 웹훅을
					만들고, 대시보드에서 고치지 않는 한 봇 없이도 계속 전송돼요.
				</InfoBox>
			)}

			{subscriptions?.map((subscription) => {
				const editing = editingId === subscription.id;
				const confirming = confirmingId === subscription.id;
				const busy = busyId === subscription.id;
				const target = channelName(subscription.targetChannelId);

				return (
					<Card key={subscription.id} padding="lg" className="flex flex-col gap-3">
						<div className="flex flex-wrap items-center gap-2">
							<Badge variant={PLATFORM_BADGE[subscription.platform]}>{SOCIAL_PLATFORM_LABELS[subscription.platform]}</Badge>
							<Badge variant={STATUS_BADGE[subscription.status]} dot>
								{STATUS_LABEL[subscription.status]}
							</Badge>
							<span className="text-sm font-medium">{subscription.sourceName}</span>
							<span className="text-muted-foreground text-sm">→ #{target ?? subscription.targetChannelId}</span>
							<span className="text-muted-foreground text-xs">
								{new Date(subscription.createdAt).toLocaleDateString("ko-KR")}
							</span>
							<div className="ml-auto flex flex-wrap items-center gap-2">
								<Button size="sm" variant="secondary" disabled={busy} onClick={() => void toggleStatus(subscription)}>
									{subscription.status === "disabled" ? <Play size={14} /> : <Pause size={14} />}
									{subscription.status === "disabled" ? "재개" : "일시정지"}
								</Button>
								<Button
									size="sm"
									variant="secondary"
									onClick={() => (editing ? setEditingId(null) : startEdit(subscription))}
								>
									<PencilLine size={14} />
									{editing ? "편집 닫기" : "알림 설정"}
								</Button>
								{confirming ? (
									<>
										<Button size="sm" variant="danger" disabled={busy} onClick={() => void remove(subscription)}>
											<Trash2 size={14} />
											정말 삭제
										</Button>
										<Button size="sm" variant="ghost" onClick={cancelConfirm}>
											취소
										</Button>
									</>
								) : (
									<Button size="sm" variant="ghost" disabled={busy} onClick={() => requestDelete(subscription.id)}>
										<Trash2 size={14} />
										삭제
									</Button>
								)}
							</div>
						</div>

						{subscription.status === "failed" && (
							<WarningBox>
								이 알림은 전송에 계속 실패하고 있어요. 웹훅이나 대상 채널이 삭제되었을 수 있어요. 채널을 확인한 뒤 알림을
								삭제하고 다시 추가해 주세요.
							</WarningBox>
						)}

						{!editing && subscription.messageTemplate && (
							<div className="bg-muted rounded-md px-3 py-2 text-sm break-all whitespace-pre-wrap">{subscription.messageTemplate}</div>
						)}

						{!editing && (subscription.webhookName || subscription.webhookAvatarUrl || !subscription.showThumbnail) && (
							<p className="text-muted-foreground text-xs">
								웹훅 표시: {subscription.webhookName ?? "기본"}
								{subscription.webhookAvatarUrl ? " · 커스텀 프로필 사진" : ""}
								{!subscription.showThumbnail ? " · 섬네일 이미지 없음" : ""}
							</p>
						)}

						{editing && (
							<div className="flex flex-col gap-3">
								<TemplateEditor guildId={guildId} value={draft} onChange={setDraft} sample={sampleFor(subscription)} />
								<div className="flex flex-col gap-2">
									<span className="text-xs font-medium text-muted-foreground">웹훅 표시 (비우면 기본)</span>
									<div className="grid gap-2 sm:grid-cols-2">
										<Input
											value={nameDraft}
											onChange={(event) => setNameDraft(event.target.value)}
											placeholder="웹훅 표시명"
											maxLength={80}
										/>
										<Input
											value={avatarDraft}
											onChange={(event) => setAvatarDraft(event.target.value)}
											placeholder="프로필 사진 URL (https://...)"
											maxLength={2048}
										/>
									</div>
								</div>
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
									<Button size="sm" variant="secondary" onClick={() => setEditingId(null)}>
										취소
									</Button>
									<Button size="sm" disabled={busy} onClick={() => void saveSettings(subscription)}>
										저장
									</Button>
								</div>
							</div>
						)}
					</Card>
				);
			})}
		</section>
	);
}