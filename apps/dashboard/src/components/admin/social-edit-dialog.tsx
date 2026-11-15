"use client";

import { useState } from "react";

import { Field } from "@/components/primitives/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { notifyApiError, notifySaved } from "@/lib/notify";

export interface AdminSocialSubscription {
	id: string;
	guildId: string;
	platform: string;
	sourcePlatformId: string;
	sourceName: string;
	targetChannelId: string;
	messageTemplate: string | null;
	webhookName: string | null;
	webhookAvatarUrl: string | null;
	showThumbnail: boolean;
	status: "active" | "failed" | "disabled";
	createdAt: string;
	updatedAt: string;
}

export function SocialEditDialog({
	sub,
	open,
	onOpenChange,
	onSaved,
}: {
	sub: AdminSocialSubscription;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSaved: () => void;
}) {
	const [sourceName, setSourceName] = useState(sub.sourceName);
	const [status, setStatus] = useState<"active" | "failed" | "disabled">(sub.status);
	const [messageTemplate, setMessageTemplate] = useState(sub.messageTemplate ?? "");
	const [webhookName, setWebhookName] = useState(sub.webhookName ?? "");
	const [showThumbnail, setShowThumbnail] = useState(sub.showThumbnail);
	const [saving, setSaving] = useState(false);

	async function handleSave() {
		setSaving(true);
		try {
			const res = await fetch(`/api/admin/social/${sub.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					sourceName: sourceName.trim(),
					status,
					messageTemplate: messageTemplate.trim() || null,
					webhookName: webhookName.trim() || null,
					showThumbnail,
				}),
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body?.error ?? "구독 수정에 실패했어요.");
				return;
			}
			onSaved();
			onOpenChange(false);
			notifySaved("소셜 알림 구독을 수정했어요.", null);
		} catch (err) {
			notifyApiError(err, "구독 수정에 실패했어요.");
		} finally {
			setSaving(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>소셜 알림 구독 수정 · {sub.sourceName}</DialogTitle>
					<DialogDescription className="font-mono text-xs">
						서버 {sub.guildId} · 채널 {sub.targetChannelId}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-2">
					<Field label="표시 채널 이름">
						<Input value={sourceName} onChange={(e) => setSourceName(e.target.value)} maxLength={120} />
					</Field>

					<Field label="배달 상태">
						<Select
							value={status}
							onValueChange={(v) => v && setStatus(v as "active" | "failed" | "disabled")}
						>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="active">정상 (active)</SelectItem>
								<SelectItem value="failed">배달 실패 (failed)</SelectItem>
								<SelectItem value="disabled">일시정지 (disabled)</SelectItem>
							</SelectContent>
						</Select>
					</Field>

					<Field label="웹훅 표시 이름 오버라이드 (비우면 기본값)">
						<Input value={webhookName} onChange={(e) => setWebhookName(e.target.value)} maxLength={80} />
					</Field>

					<Field label="알림 메시지 템플릿 ({title}, {url}, {author} 사용 가능)">
						<Textarea
							value={messageTemplate}
							onChange={(e) => setMessageTemplate(e.target.value)}
							rows={3}
							maxLength={1000}
						/>
					</Field>

					<Switch
						label="라이브 섬네일 이미지 표시"
						size="sm"
						checked={showThumbnail}
						onChange={setShowThumbnail}
					/>
				</div>

				<DialogFooter>
					<DialogClose render={<Button variant="ghost" />}>취소</DialogClose>
					<Button variant="primary" loading={saving} onClick={() => void handleSave()}>
						저장하기
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
