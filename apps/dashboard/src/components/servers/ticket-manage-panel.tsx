import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";

/**
 * 티켓 관리 — 열린/마감된 티켓 목록과 대화 기록(transcript) 조회.
 *
 * 이 화면은 **서버 관리 권한(role: manage)** 라우트만 호출해요:
 * - 목록: `/api/servers/{id}/ticket/tickets?status=open|closed`
 * - 기록: `/api/servers/{id}/ticket/{ticketId}/transcript` (비공개 버킷을 data-api 경유로 읽어요)
 * 채널은 마감 5초 뒤 삭제되므로, 대화 원문은 여기 기록으로만 남아요.
 */

interface TicketRow {
	id: string;
	ticketNumber: number;
	ownerId: string;
	status: "open" | "closed" | string;
	claimedById: string | null;
	closedById: string | null;
	closeReason: string | null;
	transcriptKey: string | null;
	createdAt: string;
	closedAt: string | null;
}

interface TranscriptMessage {
	id: string;
	authorId: string;
	authorTag: string;
	bot: boolean;
	createdAt: string;
	content: string;
	editedAt: string | null;
	attachments: { name: string; url: string; size: number }[];
}

interface TranscriptFile {
	ticketNumber: number;
	ownerId: string;
	closeReason: string | null;
	closedAt: string | null;
	messageCount: number;
	truncated: boolean;
	messages: TranscriptMessage[];
}

const DATE_FORMAT = new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" });

function formatDate(value: string | null): string {
	if (!value) return "-";
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? value : DATE_FORMAT.format(date);
}

export function TicketManagePanel({ guildId }: { guildId: string }) {
	const [status, setStatus] = useState<"open" | "closed">("open");
	const [tickets, setTickets] = useState<TicketRow[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [transcript, setTranscript] = useState<TranscriptFile | null>(null);
	const [transcriptError, setTranscriptError] = useState<string | null>(null);
	const [transcriptLoading, setTranscriptLoading] = useState(false);

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch(`/api/servers/${guildId}/ticket/tickets?status=${status}`, { cache: "no-store" });
			const body = (await res.json().catch(() => null)) as { tickets?: TicketRow[]; error?: string } | null;
			if (!res.ok || !body?.tickets) {
				setError(body?.error ?? "티켓 목록을 불러오지 못했어요.");
				setTickets([]);
				return;
			}
			setTickets(body.tickets);
		} catch {
			setError("티켓 목록을 불러오지 못했어요.");
			setTickets([]);
		} finally {
			setLoading(false);
		}
	}, [guildId, status]);

	useEffect(() => {
		void load();
	}, [load]);

	const closeTicket = useCallback(
		async (ticket: TicketRow) => {
			const res = await fetch(`/api/servers/${guildId}/ticket/tickets`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ ticketId: ticket.id, reason: "대시보드에서 마감" })
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { error?: string } | null;
				setError(body?.error ?? "티켓을 마감하지 못했어요.");
				return;
			}
			await load();
		},
		[guildId, load]
	);

	const openTranscript = useCallback(
		async (ticket: TicketRow) => {
			setTranscriptLoading(true);
			setTranscriptError(null);
			setTranscript(null);
			try {
				const res = await fetch(`/api/servers/${guildId}/ticket/${ticket.id}/transcript`, { cache: "no-store" });
				if (!res.ok) {
					const body = (await res.json().catch(() => null)) as { error?: string } | null;
					setTranscriptError(body?.error ?? "대화 기록을 불러오지 못했어요.");
					return;
				}
				setTranscript((await res.json()) as TranscriptFile);
			} catch {
				setTranscriptError("대화 기록을 불러오지 못했어요.");
			} finally {
				setTranscriptLoading(false);
			}
		},
		[guildId]
	);

	const downloadTranscript = useCallback(() => {
		if (!transcript) return;
		const blob = new Blob([JSON.stringify(transcript, null, 2)], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = `ticket-${String(transcript.ticketNumber).padStart(4, "0")}.json`;
		link.click();
		URL.revokeObjectURL(url);
	}, [transcript]);

	return (
		<section className="space-y-4">
			<header className="flex flex-wrap items-center justify-between gap-2">
				<div>
					<h3 className="text-sm font-semibold">티켓 목록</h3>
					<p className="text-xs text-muted-foreground">마감된 티켓의 대화 기록은 여기서만 볼 수 있어요 (채널은 삭제돼요).</p>
				</div>
				<div className="flex gap-2">
					{(["open", "closed"] as const).map((value) => (
						<button
							key={value}
							type="button"
							onClick={() => setStatus(value)}
							className={`rounded-md border px-3 py-1 text-xs ${status === value ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
						>
							{value === "open" ? "진행 중" : "마감"}
						</button>
					))}
				</div>
			</header>

			{error ? <p className="text-xs text-destructive">{error}</p> : null}
			{loading && !tickets ? <p className="text-xs text-muted-foreground">불러오는 중…</p> : null}
			{!loading && tickets?.length === 0 ? <p className="text-xs text-muted-foreground">티켓이 없어요.</p> : null}

			{tickets && tickets.length > 0 ? (
				<ul className="divide-y rounded-lg border">
					{tickets.map((ticket) => (
						<li key={ticket.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
							<div className="flex min-w-0 flex-col gap-0.5">
								<span className="flex items-center gap-2 font-medium">
									#{String(ticket.ticketNumber).padStart(4, "0")}
									<Badge variant={ticket.status === "open" ? "primary" : "secondary"}>{ticket.status === "open" ? "진행 중" : "마감"}</Badge>
								</span>
								<span className="truncate text-xs text-muted-foreground">
									신청 <span className="font-mono">{ticket.ownerId}</span> · {formatDate(ticket.createdAt)}
									{ticket.closeReason ? ` · 사유: ${ticket.closeReason}` : ""}
								</span>
							</div>
							<div className="flex gap-2">
								{ticket.status === "open" ? (
									<button
										type="button"
										onClick={() => void closeTicket(ticket)}
										className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
									>
										마감
									</button>
								) : null}
								<button
									type="button"
									onClick={() => void openTranscript(ticket)}
									disabled={!ticket.transcriptKey || transcriptLoading}
									className="rounded-md border px-2 py-1 text-xs disabled:opacity-40"
								>
									대화 기록
								</button>
							</div>
						</li>
					))}
				</ul>
			) : null}

			{transcriptLoading ? <p className="text-xs text-muted-foreground">대화 기록을 불러오는 중…</p> : null}
			{transcriptError ? <p className="text-xs text-destructive">{transcriptError}</p> : null}
			{transcript ? (
				<div className="space-y-2 rounded-lg border p-3">
					<div className="flex items-center justify-between gap-2">
						<h4 className="text-sm font-semibold">
							#{String(transcript.ticketNumber).padStart(4, "0")} 대화 기록 ({transcript.messageCount}개{transcript.truncated ? ", 일부" : ""})
						</h4>
						<div className="flex gap-2">
							<button type="button" onClick={() => downloadTranscript()} className="rounded-md border px-2 py-1 text-xs">
								JSON 내려받기
							</button>
							<button type="button" onClick={() => setTranscript(null)} className="rounded-md border px-2 py-1 text-xs">
								닫기
							</button>
						</div>
					</div>
					<ol className="max-h-96 space-y-2 overflow-y-auto text-sm">
						{transcript.messages.map((message) => (
							<li key={message.id} className="rounded-md bg-muted/40 px-2 py-1">
								<div className="text-xs text-muted-foreground">
									{message.authorTag}
									{message.bot ? " (봇)" : ""} · {formatDate(message.createdAt)}
									{message.editedAt ? " (편집됨)" : ""}
								</div>
								<p className="whitespace-pre-wrap break-words">{message.content || "(내용 없음)"}</p>
								{message.attachments.length > 0 ? (
									<ul className="mt-1 text-xs">
										{message.attachments.map((attachment) => (
											<li key={attachment.url}>
												<a href={attachment.url} target="_blank" rel="noreferrer" className="underline">
													첨부: {attachment.name}
												</a>
											</li>
										))}
									</ul>
								) : null}
							</li>
						))}
					</ol>
				</div>
			) : null}
		</section>
	);
}
