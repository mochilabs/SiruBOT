"use client";

import { useState } from "react";
import {
	INCIDENT_NOTICE_MAX_LENGTH,
	type IncidentNotice,
	incidentNoticeInputSchema,
} from "@sirubot/utils/incidentNotice";
import { Megaphone, Trash2 } from "lucide-react";
import useSWR from "swr";

import { InfoBox, PanelHeader, RetryLink, WarningBox } from "@/components/servers/settings-shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SkeletonCard } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { notifyApiError } from "@/lib/notify";
import { createApiFetcher } from "@/lib/swr";

const EXPIRY_OPTIONS = [
	{ minutes: 30, label: "30분" },
	{ minutes: 60, label: "1시간" },
	{ minutes: 6 * 60, label: "6시간" },
	{ minutes: 24 * 60, label: "1일" },
	{ minutes: 3 * 24 * 60, label: "3일" },
	{ minutes: 7 * 24 * 60, label: "7일" },
] as const;

const noticeFetcher = createApiFetcher<{ notice: IncidentNotice | null }>("장애 공지를 불러오지 못했어요.");

function formatExpiry(expiresAt: number): string {
	return new Date(expiresAt).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}

export function IncidentNoticePanel() {
	const { data, error, isLoading, mutate } = useSWR<{ notice: IncidentNotice | null }>(
		"/api/admin/incident-notice",
		noticeFetcher,
		{ refreshInterval: 30_000 },
	);
	const [message, setMessage] = useState("");
	const [expiresInMinutes, setExpiresInMinutes] = useState<number>(60);
	const [busy, setBusy] = useState<"publish" | "clear" | null>(null);

	const input = incidentNoticeInputSchema.safeParse({ message, expiresInMinutes });
	const validationMessage = message.length > 0 && !input.success ? input.error.issues[0]?.message : null;

	async function publish() {
		if (!input.success) return;
		setBusy("publish");
		try {
			const res = await fetch("/api/admin/incident-notice", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(input.data),
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body?.error ?? "장애 공지를 올리지 못했어요.");
				return;
			}
			await mutate({ notice: body.notice }, { revalidate: false });
			setMessage("");
			toast.success("장애 공지를 올렸어요.");
		} catch (err) {
			notifyApiError(err, "장애 공지를 올리지 못했어요.");
		} finally {
			setBusy(null);
		}
	}

	async function clear() {
		setBusy("clear");
		try {
			const res = await fetch("/api/admin/incident-notice", { method: "DELETE" });
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(body?.error ?? "장애 공지를 내리지 못했어요.");
				return;
			}
			await mutate({ notice: null }, { revalidate: false });
			toast.success("장애 공지를 내렸어요.");
		} catch (err) {
			notifyApiError(err, "장애 공지를 내리지 못했어요.");
		} finally {
			setBusy(null);
		}
	}

	const notice = data?.notice ?? null;

	return (
		<Card padding="md" className="space-y-5">
			<PanelHeader
				icon={<Megaphone size={20} />}
				title="장애 공지"
				description="오류 화면과 재생 실패 알림에 함께 표시돼요."
			/>

			{isLoading && !data ? (
				<SkeletonCard className="h-24" />
			) : error && !data ? (
				<WarningBox>
					현재 공지를 불러오지 못했어요. ({error.message}) <RetryLink onRetry={() => void mutate()} />
				</WarningBox>
			) : notice ? (
				<div className="space-y-3 rounded-control bg-surface-2 p-4">
					<p className="text-xs font-bold text-muted-foreground">지금 올라가 있는 공지</p>
					<p className="break-words text-sm font-medium text-foreground">{notice.message}</p>
					<p className="text-xs text-muted-foreground">만료: {formatExpiry(notice.expiresAt)}</p>
					<Button
						variant="danger"
						size="sm"
						icon={<Trash2 size={14} />}
						loading={busy === "clear"}
						disabled={busy !== null}
						onClick={() => void clear()}
					>
						공지 내리기
					</Button>
				</div>
			) : (
				<InfoBox>지금 올라가 있는 공지가 없어요.</InfoBox>
			)}

			<div className="space-y-3">
				<label htmlFor="incident-notice-message" className="text-sm font-bold text-foreground">
					새 공지 {notice ? "(올리면 지금 공지를 덮어써요)" : ""}
				</label>
				<Textarea
					id="incident-notice-message"
					value={message}
					maxLength={INCIDENT_NOTICE_MAX_LENGTH + 50}
					aria-invalid={validationMessage ? true : undefined}
					placeholder="예: YouTube 재생이 불안정해요. 복구 중이에요."
					onChange={(event) => setMessage(event.target.value)}
				/>
				<div className="flex items-center justify-between text-xs text-muted-foreground">
					<span className={validationMessage ? "text-destructive" : undefined}>{validationMessage ?? "한 줄로 써 주세요."}</span>
					<span className="tabular-nums">
						{message.length} / {INCIDENT_NOTICE_MAX_LENGTH}
					</span>
				</div>

				<fieldset className="space-y-2">
					<legend className="text-sm font-bold text-foreground">만료 시간</legend>
					<div className="flex flex-wrap gap-2">
						{EXPIRY_OPTIONS.map((option) => (
							<Button
								key={option.minutes}
								type="button"
								size="sm"
								variant={expiresInMinutes === option.minutes ? "primary" : "secondary"}
								aria-pressed={expiresInMinutes === option.minutes}
								onClick={() => setExpiresInMinutes(option.minutes)}
							>
								{option.label}
							</Button>
						))}
					</div>
				</fieldset>

				<Button
					variant="primary"
					icon={<Megaphone size={14} />}
					loading={busy === "publish"}
					disabled={busy !== null || !input.success}
					onClick={() => void publish()}
				>
					공지 올리기
				</Button>
			</div>
		</Card>
	);
}
