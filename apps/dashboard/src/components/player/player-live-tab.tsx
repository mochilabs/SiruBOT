"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ListMusic, Pause, Play, Radio, SkipForward, Square, Volume2 } from "lucide-react";
import useSWR from "swr";

import type { LivePlayerState } from "@/app/api/servers/[id]/live/route";
import { EmptyState } from "@/components/primitives/empty-state";
import { StatusDot } from "@/components/primitives/status-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SkeletonLine } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/components/ui/toast";
import { toError } from "@/lib/api-error";
import { PLAYER_VOLUME_MAX } from "@/lib/data-api";

/** 라이브 탭 컨트롤러 볼륨 상한 — 봇 /volume 명령 계약(0~150)과 같아요 */
const LIVE_VOLUME_MAX = PLAYER_VOLUME_MAX;
/** 볼륨 슬라이더 값을 서버로 보내기 전 모으는 디바운스 — 드래그 중 연타를 막아요 */
const VOLUME_SEND_DEBOUNCE_MS = 400;

/** 봇 검증 실패 시 안내 문구도 전달해요 — "명령 실패" 대신 실제 이유를 토스트로 보여줘요 */
async function sendPlayerCommand(
  guildId: string,
  action: "volume" | "pause" | "resume" | "skip" | "stop",
  value?: number,
): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch(`/api/servers/${guildId}/player/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...(value !== undefined ? { value } : {}) }),
  });
  if (res.ok) return { ok: true };
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return { ok: false, message: body?.error ?? "명령을 전달하지 못했어요." };
}

function formatMs(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * 마지막 스냅샷 이후 경과 보간 — 재생 중이면 position + 경과, 아니면 스냅샷 그대로.
 */
function interpolatedPositionMs(state: LivePlayerState, receivedAt: number): number {
	if (state.isStream || state.durationMs <= 0) return state.positionMs;
	if (!state.playing || state.paused) return state.positionMs;
	const elapsed = Math.max(0, Date.now() - receivedAt);
	return Math.min(state.durationMs, state.positionMs + elapsed);
}

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

interface NowPlayingProps {
	state: LivePlayerState;
	hubStaleMs: number;
	receivedAt: number;
	connected: boolean;
	mode: "stream" | "polling";
	guildId: string;
}

function NowPlaying({ state, hubStaleMs, receivedAt, connected, mode, guildId }: NowPlayingProps) {
	const toast = useToast();
	const positionMs = interpolatedPositionMs(state, receivedAt);

	// 낙관적 상태 — 명령 전송 중엔 의도 값으로 보여요. 봇이 같은 값으로 상태 퍼블리시하면 해제해요.
	const [pausedOverride, setPausedOverride] = useState<boolean | null>(null);
	const [pendingAction, setPendingAction] = useState<"pause" | "resume" | "skip" | "stop" | null>(null);
	const [volumeOverride, setVolumeOverride] = useState<number | null>(null);
	const volumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// 봇 상태가 낙관적 값과 같으면 오버라이드를 해제해 "실제 상태 표시"로 복귀해요.
	useEffect(() => {
		if (pausedOverride !== null && state.paused === pausedOverride) setPausedOverride(null);
	}, [pausedOverride, state.paused]);
	useEffect(() => {
		if (volumeOverride !== null && Math.round(state.volume) === volumeOverride) setVolumeOverride(null);
	}, [volumeOverride, state.volume]);
	useEffect(() => {
		return () => {
			if (volumeTimerRef.current) clearTimeout(volumeTimerRef.current);
		};
	}, []);

	const displayedPaused = pausedOverride ?? state.paused;
	const displayedVolume = volumeOverride ?? Math.round(state.volume);

	const failCommand = useCallback((result: { ok: boolean; message?: string }, fallbackMessage: string) => {
		setPausedOverride(null);
		setVolumeOverride(null);
		setPendingAction(null);
		toast.error(result.ok ? fallbackMessage : result.message || fallbackMessage, "봇이 접속 중인지 확인해 주세요.");
	}, [toast]);

	const handleTogglePause = useCallback(async () => {
		const action = displayedPaused ? "resume" : "pause";
		setPendingAction(action);
		setPausedOverride(!displayedPaused);
		const result = await sendPlayerCommand(guildId, action);
		if (!result.ok) failCommand(result, "명령을 전달하지 못했어요.");
		else setPendingAction(null);
	}, [displayedPaused, failCommand, guildId]);

	const handleSkip = useCallback(async () => {
		setPendingAction("skip");
		const result = await sendPlayerCommand(guildId, "skip");
		if (!result.ok) failCommand(result, "명령을 전달하지 못했어요.");
		else setPendingAction(null);
	}, [failCommand, guildId]);

	const handleStop = useCallback(async () => {
		setPendingAction("stop");
		const result = await sendPlayerCommand(guildId, "stop");
		if (!result.ok) failCommand(result, "정지하지 못했어요.");
		else setPendingAction(null);
	}, [failCommand, guildId]);

	const handleVolumeChange = useCallback(
		(volume: number) => {
			setVolumeOverride(volume);
			if (volumeTimerRef.current) clearTimeout(volumeTimerRef.current);
			volumeTimerRef.current = setTimeout(async () => {
				const result = await sendPlayerCommand(guildId, "volume", volume);
				if (!result.ok) failCommand(result, "볼륨을 적용하지 못했어요.");
			}, VOLUME_SEND_DEBOUNCE_MS);
		},
		[failCommand, guildId],
	);

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
						className="h-20 w-20 shrink-0 rounded-card object-cover"
					/>
				) : (
					<div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-card bg-surface-2 text-muted-foreground">
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
					</div>
				</div>
			</div>

			<div className="space-y-3">
				<div className="space-y-1">
					<ProgressBar state={state} receivedAt={receivedAt} />
					<div className="flex items-center justify-between text-xs font-medium tabular-nums text-muted-foreground">
						<span>{state.isStream ? "스트리밍" : formatMs(positionMs)}</span>
						<span>{state.isStream ? "" : formatMs(state.durationMs)}</span>
					</div>
				</div>

				{/* 실시간 컨트롤러 — 명령은 data-api Redis 브로드캐스트로 봇에 즉시 적용돼요 */}
				<div className="flex items-center gap-2 pt-3">
					<Button
						variant="secondary"
						size="sm"
						icon={displayedPaused ? <Play size={14} /> : <Pause size={14} />}
						onClick={handleTogglePause}
						loading={pendingAction === "pause" || pendingAction === "resume"}
						disabled={pendingAction !== null && pendingAction !== "pause" && pendingAction !== "resume"}
						aria-label={displayedPaused ? "재생" : "일시정지"}
					>
						{displayedPaused ? "재생" : "일시정지"}
					</Button>
					<Button
						variant="secondary"
						size="sm"
						icon={<SkipForward size={14} />}
						onClick={handleSkip}
						loading={pendingAction === "skip"}
						disabled={pendingAction !== null && pendingAction !== "skip"}
						aria-label="다음 곡"
					>
						스킵
					</Button>
					<Button
						variant="secondary"
						size="sm"
						icon={<Square size={14} />}
						onClick={handleStop}
						loading={pendingAction === "stop"}
						disabled={pendingAction !== null && pendingAction !== "stop"}
						aria-label="정지"
					>
						정지
					</Button>
					<div className="ml-auto flex min-w-0 flex-1 items-center gap-2 md:flex-none md:w-56">
						<Volume2 size={16} className="shrink-0 text-muted-foreground" aria-hidden />
						<Slider
							value={displayedVolume}
							min={0}
							max={LIVE_VOLUME_MAX}
							step={1}
							onChange={handleVolumeChange}
							showValue
							formatValue={(value) => `${value}%`}
							aria-label="볼륨"
						/>
					</div>
				</div>
			</div>
		</Card>
	);
}

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
							className="animate-page-in flex items-center gap-3 rounded-card bg-surface-2 px-3 py-2 opacity-0"
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
			<NowPlaying state={data.player} hubStaleMs={data.hub.staleMs} receivedAt={receivedAt} connected={connected} mode={mode} guildId={guildId} />
			<QueueList state={data.player} />
			<p className="text-xs text-muted-foreground">
				컨트롤러 명령은 봇이 음성 채널 접속 중일 때만 적용돼요. 검색·재생 · 기록은{" "}
				<Link href={`/player/${guildId}`} className="font-semibold text-primary-text hover:underline">
					음악 플레이어 페이지
				</Link>
				에서 할 수 있어요.
			</p>
		</div>
	);
}
