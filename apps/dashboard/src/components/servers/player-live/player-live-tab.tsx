"use client";

import { useEffect, useState } from "react";
import { ListMusic, Radio } from "lucide-react";
import useSWR from "swr";

import type { LivePlayerState } from "@/app/api/servers/[id]/live/route";
import { Badge } from "@/components/primitives/badge";
import { Card } from "@/components/primitives/card";
import { EmptyState } from "@/components/primitives/empty-state";
import { SkeletonLine } from "@/components/primitives/skeleton";
import { StatusDot } from "@/components/primitives/status-dot";
import { toError } from "@/lib/api-error";
import { fetcher } from "@/lib/fetcher";

/* ─────────────────────────── 시간 포맷 ─────────────────────────── */

function formatMs(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/* ─────────────────────────── 진행 바 ─────────────────────────── */

function ProgressBar({ state }: { state: LivePlayerState }) {
	// 라이브 스트림은 길이가 정해지지 않아 진행률을 그리지 않아요.
	if (state.isStream || state.durationMs <= 0) {
		return <div className="h-1.5 w-full rounded-full bg-muted" />;
	}

	const ratio = Math.min(1, Math.max(0, state.positionMs / state.durationMs));
	// 폴링 사이 보간 — 일시정지면 마지막 위치에 고정해요.
	return (
		<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
			<div
				className="h-full rounded-full bg-primary"
				style={{ width: `${ratio * 100}%` }}
			/>
		</div>
	);
}

/* ─────────────────────────── 상태 헤더 ─────────────────────────── */

function StatusHeader({ state, staleMs }: { state: LivePlayerState; staleMs: number }) {
	if (state.stale) {
		return (
			<Badge variant="warning" dot>
				상태 오래됨 · 데이터 갱신 중지 ( {Math.floor(state.ageMs / 1000)}초 전 마지막 갱신, 허브 만료 {staleMs / 1000}초 )
			</Badge>
		);
	}
	if (state.paused) {
		return (
			<Badge variant="warning" dot>
				일시정지
			</Badge>
		);
	}
	if (state.playing) {
		return (
			<Badge variant="success" dot>
				재생 중
			</Badge>
		);
	}
	return (
		<Badge variant="default" dot>
			대기 중
		</Badge>
	);
}

/* ─────────────────────────── Now Playing 패널 ─────────────────────────── */

function NowPlaying({ state, hubStaleMs }: { state: LivePlayerState; hubStaleMs: number }) {
	return (
		<Card padding="lg" className="gap-4">
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<StatusDot status={state.playing && !state.paused ? "ready" : state.paused ? "idle" : "disconnected"} label="라이브" />
					<StatusHeader state={state} staleMs={hubStaleMs} />
				</div>
				<span className="text-2xs text-muted-foreground/60">
					{Math.floor(state.ageMs / 1000)}초 전 갱신
				</span>
			</div>

			<div className="flex items-start gap-4">
				{/* 아트워크 — 다음/이미지 도메인 없이 일반 img로 렌더 (외부 CDN 다양성) */}
				{state.artworkUrl ? (
					// eslint-disable-next-line @next/next/no-img-element
					<img
						src={state.artworkUrl}
						alt=""
						className="h-20 w-20 shrink-0 rounded-card border border-border object-cover"
					/>
				) : (
					<div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-card border border-border bg-surface-2 text-muted-foreground">
						<ListMusic size={24} />
					</div>
				)}
				<div className="min-w-0 flex-1 space-y-1">
					<p className="truncate text-lg font-bold text-foreground">
						{state.trackTitle ?? "재생 중인 곡이 없어요"}
					</p>
					<p className="truncate text-sm text-muted-foreground/80">
						{state.trackAuthor ?? "—"}
						{state.requesterName ? ` · 신청: ${state.requesterName}` : ""}
					</p>
					<div className="flex flex-wrap items-center gap-2 pt-1">
						{state.isStream && <Badge variant="destructive" size="sm">라이브 스트림</Badge>}
						{state.sourceName && <Badge size="sm">{state.sourceName}</Badge>}
						<Badge size="sm">반복: {state.repeatMode === "off" ? "없음" : state.repeatMode === "track" ? "한 곡" : "전체"}</Badge>
						<Badge size="sm">볼륨 {state.volume}%</Badge>
					</div>
				</div>
			</div>

			<div className="space-y-1">
				<ProgressBar state={state} />
				<div className="flex items-center justify-between text-xs font-medium tabular-nums text-muted-foreground/80">
					<span>{state.isStream ? "스트리밍" : formatMs(state.positionMs)}</span>
					<span>{state.isStream ? "" : formatMs(state.durationMs)}</span>
				</div>
			</div>
		</Card>
	);
}

/* ─────────────────────────── 큐 패널 ─────────────────────────── */

function QueueList({ state }: { state: LivePlayerState }) {
	return (
		<Card padding="lg" className="gap-4">
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-bold text-foreground">대기열</h3>
				<Badge variant="primary" size="sm">
					{state.queueLength}곡 대기
				</Badge>
			</div>

			{state.queue.length === 0 ? (
				<EmptyState icon={ListMusic} size="sm" title="대기열이 비어 있어요" description="Discord에서 곡을 신청하면 여기에 표시돼요." />
			) : (
				<ol className="space-y-2">
					{state.queue.map((track, index) => (
						<li key={`${track.title}-${index}`} className="flex items-center gap-3 rounded-card border border-border-subtle bg-surface-2 px-3 py-2">
							<span className="w-5 shrink-0 text-center text-sm font-black tabular-nums text-muted-foreground/60">
								{index + 1}
							</span>
							<div className="min-w-0 flex-1">
								<p className="truncate text-sm font-semibold text-foreground">{track.title}</p>
								<p className="truncate text-xs text-muted-foreground/70">
									{track.author}
									{track.requesterName ? ` · 신청: ${track.requesterName}` : ""}
								</p>
							</div>
							<span className="shrink-0 text-xs tabular-nums text-muted-foreground/70">
								{track.isStream ? "스트림" : formatMs(track.durationMs)}
							</span>
						</li>
					))}
				</ol>
			)}
		</Card>
	);
}

/* ─────────────────────────── 로딩/오류 ─────────────────────────── */

function LiveLoading() {
	return (
		<Card padding="lg" className="gap-4">
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				<Radio size={14} /> 라이브 상태 불러오는 중…
			</div>
			<div className="space-y-2">
				<SkeletonLine width="65%" height="h-5" />
				<SkeletonLine width="40%" height="h-4" />
				<SkeletonLine width="100%" height="h-2" />
			</div>
		</Card>
	);
}

/** 데이터가 없는 상태 — 길드에 플레이어가 없거나 playerHub 미구독 */
function LiveEmpty({ detail }: { detail?: string }) {
	return (
		<Card padding="lg">
			<EmptyState
				icon={Radio}
				title="지금은 재생 정보가 없어요"
				description={detail ?? "봇이 이 서버에서 음악을 재생하면 여기에 실시간 상태가 표시돼요."}
			/>
		</Card>
	);
}

/* ─────────────────────────── 패널 ─────────────────────────── */

interface LivePayload {
	player: LivePlayerState | null;
	hub: { guilds: number; subscribed: boolean; staleMs: number };
}

function PlayerLivePanel({ guildId }: { guildId: string }) {
	// SWR 폴백 폴링 — 2초. 실시간 푸시가 필요하면 추후 SSE/WS로 교체.
	const { data, error, isLoading } = useSWR<LivePayload>(`/api/servers/${guildId}/live`, fetcher, {
		refreshInterval: 2000,
		keepPreviousData: true,
	});

	// 폴링 사이 progress 부드럽게 보간
	const [, tickState] = useState(0);
	useEffect(() => {
		const timer = setInterval(() => tickState((v) => v + 1), 1000);
		return () => clearInterval(timer);
	}, []);

	if (error) {
		const apiError = toError(error, "라이브 상태를 불러오지 못했어요.");
		return (
			<Card padding="lg">
				<EmptyState icon={Radio} title="라이브 상태를 불러오지 못했어요" description={apiError.message} />
			</Card>
		);
	}
	if (isLoading) return <LiveLoading />;
	if (!data) return <LiveLoading />;
	if (!data.player) {
		return (
			<LiveEmpty
				detail={
					data.hub.subscribed
						? undefined
						: "상태 허브가 Redis에 연결되지 않았어요. 관리자에게 문의해 주세요."
				}
			/>
		);
	}

	return (
		<div className="grid gap-6">
			<NowPlaying state={data.player} hubStaleMs={data.hub.staleMs} />
			<QueueList state={data.player} />
			<p className="text-xs text-muted-foreground/50">
				{/* 제어(일시정지/스킵/볼륨)는 보안상 봇 RPC 경로로 별도 구현 예정 — 이 화면은 view only */}
				재생 제어는 봇 컨트롤러/커맨드에서 할 수 있어요. 이 화면은 실시간 상태 표시 전용이에요. 제어는 bot RPC로 별도 구현 예정이에요.
			</p>
		</div>
	);
}

export default function PlayerLiveTab({ guildId }: { guildId: string }) {
	return <PlayerLivePanel guildId={guildId} />;
}