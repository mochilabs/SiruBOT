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

/* ─────────────────────────── 시간 포맷 ─────────────────────────── */

function formatMs(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/* ─────────────────────────── 진행 보간 ─────────────────────────── */

/**
 * 마지막 스냅샷 이후 경과 보간 — 재생 중이면 position + 경과, 아니면 스냅샷 그대로.
 */
function interpolatedPositionMs(state: LivePlayerState, receivedAt: number): number {
	if (state.isStream || state.durationMs <= 0) return state.positionMs;
	if (!state.playing || state.paused) return state.positionMs;
	const elapsed = Math.max(0, Date.now() - receivedAt);
	return Math.min(state.durationMs, state.positionMs + elapsed);
}

/* ─────────────────────────── 진행 바 ─────────────────────────── */

function ProgressBar({ state, receivedAt }: { state: LivePlayerState; receivedAt: number }) {
	// 라이브 스트림은 길이가 정해지지 않아 진행률을 그리지 않아요.
	if (state.isStream || state.durationMs <= 0) {
		return <div className="h-1.5 w-full rounded-full bg-muted" />;
	}

	const positionMs = interpolatedPositionMs(state, receivedAt);
	const ratio = Math.min(1, Math.max(0, positionMs / state.durationMs));
	// SSE 수신 사이 진행바 보간 — 일시정지면 마지막 위치에 고정해요.
	// width 전환 토큰으로 좌우 흔들림 없이 부드럽게 이어져요.
	return (
		<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
			<div
				className="h-full rounded-full bg-primary transition-[width] duration-slow ease-linear"
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

interface NowPlayingProps {
	state: LivePlayerState;
	hubStaleMs: number;
	receivedAt: number;
	connected: boolean;
	mode: "stream" | "polling";
}

function NowPlaying({ state, hubStaleMs, receivedAt, connected, mode }: NowPlayingProps) {
	const positionMs = interpolatedPositionMs(state, receivedAt);

	return (
		<Card padding="lg" className="gap-4">
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<StatusDot status={state.playing && !state.paused ? "ready" : state.paused ? "idle" : "disconnected"} label="라이브" />
					<StatusHeader state={state} staleMs={hubStaleMs} />
					{/* 연결 방식 뱃지 — 실시간(SSE) / 연결 중 / 폴링 */}
					<Badge
						size="sm"
						variant={connected ? "success" : mode === "stream" ? "warning" : "default"}
					>
						{mode === "stream" ? (connected ? "실시간" : "연결 중…") : `폴링 ${FALLBACK_POLL_INTERVAL_MS / 1000}초`}
					</Badge>
				</div>
				<span className="text-2xs text-muted-foreground">
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
					<p className="truncate text-sm text-muted-foreground">
						{state.trackAuthor ?? "값 없음"}
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
				<ProgressBar state={state} receivedAt={receivedAt} />
				<div className="flex items-center justify-between text-xs font-medium tabular-nums text-muted-foreground">
					<span>{state.isStream ? "스트리밍" : formatMs(positionMs)}</span>
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
						<li
							key={`${track.title}-${index}`}
							className="animate-page-in flex items-center gap-3 rounded-card border border-border-subtle bg-surface-2 px-3 py-2 opacity-0"
							style={{ animationDelay: `${Math.min(index, 9) * 40}ms`, animationFillMode: "forwards" }}
						>
							<span className="w-5 shrink-0 text-center text-sm font-black tabular-nums text-muted-foreground">
								{index + 1}
							</span>
							<div className="min-w-0 flex-1">
								<p className="truncate text-sm font-semibold text-foreground">{track.title}</p>
								<p className="truncate text-xs text-muted-foreground">
									{track.author}
									{track.requesterName ? ` · 신청: ${track.requesterName}` : ""}
								</p>
							</div>
							<span className="shrink-0 text-xs tabular-nums text-muted-foreground">
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

/** 폴백 폴링 주기 — 2000ms면 READ_RATE(분당 30회) 경계에 딱 붙어 윈도우 지터로 429가 튀니 분당 24회로 낮춰요. */
const FALLBACK_POLL_INTERVAL_MS = 2500;

export default function PlayerLiveTab({ guildId }: { guildId: string }) {
	/** SSE 실패(미지원/장애) 시 폴백하는 폴링 모드와 상태를 구분해요. */
	const [mode, setMode] = useState<"stream" | "polling">("stream");
	const [liveData, setLiveData] = useState<LivePayload | null>(null);
	const [connected, setConnected] = useState(false);
	/** 마지막 상태 수신 시각 — 스냅샷 이후 경과를 보간하는 기준 */
	const [receivedAt, setReceivedAt] = useState<number>(Date.now());

	// 폴링 폴백 + 초기 데이터 — 항상 구독해 키/훅 순서를 유지해요 (stream 모드에선 0초 폴링).
	const { data: swrData, error, isLoading } = useSWR<LivePayload>(`/api/servers/${guildId}/live`, {
		refreshInterval: mode === "polling" ? FALLBACK_POLL_INTERVAL_MS : 0,
		keepPreviousData: true,
	});

	// polling 모드의 snapshotAt도 receivedAt으로 통일 — swr 데이터가 바뀌면 수신 시각을 기록해요.
	useEffect(() => {
		if (swrData) setReceivedAt(Date.now());
	}, [swrData]);

	// 실시간 스트림 — data-api → dashboard 프록시를 거친 SSE를 구독해요.
	useEffect(() => {
		if (mode !== "stream" || !guildId) return;

		const source = new EventSource(`/api/servers/${guildId}/live/stream`);
		let gotData = false;

		source.addEventListener("state", (e) => {
			gotData = true;
			try {
				const payload = JSON.parse((e as MessageEvent).data) as LivePayload;
				setReceivedAt(Date.now());
				setLiveData(payload);
				setConnected(true);
			} catch {
				// 잘못된 프레임 — 무시하고 다음 스냅샷을 기다려요.
			}
		});
		source.onopen = () => setConnected(true);
		source.onerror = () => {
			// data를 한 번도 못 받은 error → 스트림 미지원(프록시 404 등)으로 판단하고 폴링 폴백
			if (!gotData) {
				setMode("polling");
			} else {
				setConnected(false); // EventSource 내장 재연결에 맡긴다
			}
		};

		return () => source.close();
	}, [mode, guildId]);

	// 표시 데이터 — polling 모드에선 SWR 데이터를 사용해요.
	const data = mode === "stream" ? liveData : swrData;

	// 폴링 사이 progress 부드럽게 보간 (SSE 수신 사이 진행바 1초 보간)
	const [, tickState] = useState(0);
	useEffect(() => {
		const timer = setInterval(() => tickState((v) => v + 1), 1000);
		return () => clearInterval(timer);
	}, []);

	if (mode === "polling" && error) {
		const apiError = toError(error, "라이브 상태를 불러오지 못했어요.");
		return (
			<Card padding="lg">
				<EmptyState icon={Radio} title="라이브 상태를 불러오지 못했어요" description={apiError.message} />
			</Card>
		);
	}
	if (mode === "polling" && isLoading) return <LiveLoading />;
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
			<NowPlaying
				state={data.player}
				hubStaleMs={data.hub.staleMs}
				receivedAt={receivedAt}
				connected={connected}
				mode={mode}
			/>
			<QueueList state={data.player} />
		<p className="text-xs text-muted-foreground">
			재생 제어는 봇 컨트롤러/커맨드에서 할 수 있어요. 이 화면은 실시간 상태 표시 전용이에요.
		</p>
		</div>
	);
}
