"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ListMusic,
  Pause,
  Play,
  Radio,
  Repeat,
  SkipForward,
  Square,
  Volume2,
} from "lucide-react";
import useSWR from "swr";

import type { LivePlayerState } from "@/app/api/servers/[id]/live/route";
import { EmptyState } from "@/components/primitives/empty-state";
import { StatusDot } from "@/components/primitives/status-dot";
import { PanelError } from "@/components/servers/settings-shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SkeletonLine } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/components/ui/toast";
import { toApiError, toError } from "@/lib/api-error";
import { formatDuration } from "@/lib/format";
import { PLAYER_VOLUME_MAX } from "@/lib/player-constants";
import { playerErrorMessage } from "@/lib/player-error";
import { prettySourceName } from "@/utils";

/** 볼륨 슬라이더 값을 서버로 보내기 전 모으는 디바운스 — 드래그 중 연타를 막아요 */
const VOLUME_SEND_DEBOUNCE_MS = 400;

/** 봇 검증 실패 시 안내 문구도 전달해요 — "명령 실패" 대신 실제 이유를 토스트로 보여줘요 */
async function sendPlayerCommand(
  guildId: string,
  action: "volume" | "pause" | "resume" | "skip" | "stop" | "repeat",
  value?: number,
): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch(`/api/servers/${guildId}/player/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        ...(value !== undefined ? { value } : {}),
      }),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    return { ok: false, message: playerErrorMessage(body?.error, "명령을 전달하지 못했어요.") };
  } catch {
    return {
      ok: false,
      message: "봇에 명령을 전달하지 못했어요. 연결 상태를 확인해 주세요.",
    };
  }
}

/**
 * 마지막 스냅샷 이후 경과 보간 — 재생 중이면 position + 경과, 아니면 스냅샷 그대로.
 */
function interpolatedPositionMs(
  state: LivePlayerState,
  receivedAt: number,
): number {
  if (state.isStream || state.durationMs <= 0) return state.positionMs;
  if (state.stale || !state.playing || state.paused) return state.positionMs;
  const elapsed = Math.max(0, Date.now() - receivedAt);
  return Math.min(state.durationMs, state.positionMs + elapsed);
}

/** 진행률(0..1) — 스트림처럼 길이를 모르면 0이에요 */
function positionRatio(state: LivePlayerState, receivedAt: number): number {
  if (state.durationMs <= 0) return 0;
  const positionMs = interpolatedPositionMs(state, receivedAt);
  return Math.min(1, Math.max(0, positionMs / state.durationMs));
}

/**
 * SSE 스냅샷(수 초 간격) 사이를 선형 보간해 매 프레임 채우는 진행바 —
 * rAF에서 style.width를 직접 써요(초당 1회 리렌더 + CSS transition 계단을 없애요).
 * 스냅샷이 갱신되면 receivedAt 기준이라 다음 프레임에 정확한 위치로 따라와요.
 * 일시정지면 interpolatedPositionMs가 스냅샷 위치를 그대로 돌려줘 그 자리에 고정돼요.
 */
function ProgressBar({
  state,
  receivedAt,
}: {
  state: LivePlayerState;
  receivedAt: number;
}) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const isIndeterminate = state.isStream || state.durationMs <= 0;
  // 마운트 시 첫 폭만 고정해요 — 이후 폭은 rAF가 소유하고, 티커(1초) 리렌더가
  // 같은 문자열만 diff하도록 해 style을 되덮지 않아요.
  const initialRatioRef = useRef<number | null>(null);
  if (initialRatioRef.current === null)
    initialRatioRef.current = positionRatio(state, receivedAt);

  useEffect(() => {
    if (isIndeterminate) return;
    let raf = 0;
    const draw = () => {
      const bar = barRef.current;
      if (bar) bar.style.width = `${positionRatio(state, receivedAt) * 100}%`;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [isIndeterminate, state, receivedAt]);

  // 라이브 스트림은 길이가 정해지지 않아 진행률을 그리지 않아요.
  if (isIndeterminate) {
    return <div className="h-1.5 w-full rounded-full bg-muted" />;
  }

  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        ref={barRef}
        className="h-full rounded-full bg-primary-control"
        style={{ width: `${initialRatioRef.current * 100}%` }}
      />
    </div>
  );
}

interface NowPlayingProps {
  state: LivePlayerState;
  receivedAt: number;
  connected: boolean;
  mode: "stream" | "polling";
  guildId: string;
}

function NowPlaying({
  state,
  receivedAt,
  connected,
  mode,
  guildId,
}: NowPlayingProps) {
  const toast = useToast();
  const unavailable = state.stale || (mode === "stream" && !connected);
  const positionMs = unavailable ? state.positionMs : interpolatedPositionMs(state, receivedAt);
  const [pendingAction, setPendingAction] = useState<
    "pause" | "resume" | "skip" | "stop" | "repeat" | null
  >(null);
  const [volumeOverride, setVolumeOverride] = useState<number | null>(null);
  const volumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commandPendingRef = useRef(false);
  const volumePendingRef = useRef(false);
  const [volumePending, setVolumePending] = useState(false);
  const controlsDisabled = unavailable || volumePending || volumeOverride !== null;

  useEffect(() => {
    if (unavailable) {
      if (volumeTimerRef.current) clearTimeout(volumeTimerRef.current);
      setVolumeOverride(null);
    }
  }, [unavailable]);
  useEffect(() => {
    return () => {
      if (volumeTimerRef.current) clearTimeout(volumeTimerRef.current);
    };
  }, []);

  const displayedPaused = state.paused;
  const displayedRepeat = state.repeatMode;
  const displayedVolume = volumeOverride ?? Math.round(state.volume);
  const hasCurrentTrack =
    state.playing || state.paused || state.trackTitle !== null;

  const failCommand = useCallback(
    (result: { ok: boolean; message?: string }, fallbackMessage: string) => {
      toast.error(
        result.ok ? fallbackMessage : result.message || fallbackMessage,
      );
    },
    [toast],
  );

  const handleTogglePause = useCallback(async () => {
    if (commandPendingRef.current || controlsDisabled) return;
    commandPendingRef.current = true;
    const action = displayedPaused ? "resume" : "pause";
    setPendingAction(action);
    const result = await sendPlayerCommand(guildId, action);
    if (!result.ok) failCommand(result, "명령을 전달하지 못했어요.");
    setPendingAction(null);
    commandPendingRef.current = false;
  }, [controlsDisabled, displayedPaused, failCommand, guildId]);

  const handleSkip = useCallback(async () => {
    if (commandPendingRef.current || controlsDisabled) return;
    commandPendingRef.current = true;
    setPendingAction("skip");
    const result = await sendPlayerCommand(guildId, "skip");
    if (!result.ok) failCommand(result, "명령을 전달하지 못했어요.");
    setPendingAction(null);
    commandPendingRef.current = false;
  }, [controlsDisabled, failCommand, guildId]);

  const handleStop = useCallback(async () => {
    if (commandPendingRef.current || controlsDisabled) return;
    commandPendingRef.current = true;
    setPendingAction("stop");
    const result = await sendPlayerCommand(guildId, "stop");
    if (!result.ok) failCommand(result, "정지하지 못했어요.");
    setPendingAction(null);
    commandPendingRef.current = false;
  }, [controlsDisabled, failCommand, guildId]);

  const handleRepeat = useCallback(async () => {
    if (commandPendingRef.current || controlsDisabled) return;
    commandPendingRef.current = true;
    setPendingAction("repeat");
    const result = await sendPlayerCommand(guildId, "repeat");
    if (!result.ok) failCommand(result, "반복 설정을 바꾸지 못했어요.");
    setPendingAction(null);
    commandPendingRef.current = false;
  }, [controlsDisabled, failCommand, guildId]);

  const handleVolumeChange = useCallback(
    (volume: number) => {
      if (unavailable || volumePendingRef.current || commandPendingRef.current) return;
      setVolumeOverride(volume);
      if (volumeTimerRef.current) clearTimeout(volumeTimerRef.current);
      volumeTimerRef.current = setTimeout(async () => {
        volumePendingRef.current = true;
        setVolumePending(true);
        const result = await sendPlayerCommand(guildId, "volume", volume);
        if (!result.ok) failCommand(result, "볼륨을 적용하지 못했어요.");
        setVolumeOverride(null);
        volumePendingRef.current = false;
        setVolumePending(false);
      }, VOLUME_SEND_DEBOUNCE_MS);
    },
    [failCommand, guildId, unavailable],
  );

  return (
    <Card padding="lg" className="gap-4">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <StatusDot
          status={
            state.stale || (mode === "stream" && !connected)
              ? "disconnected"
              : state.paused
                ? "idle"
                : state.playing
                  ? "ready"
                  : "disconnected"
          }
          label={
            state.stale || (mode === "stream" && !connected)
              ? "연결 확인 중"
              : state.paused
                ? "일시정지"
                : state.playing
                  ? "재생 중"
                  : "대기 중"
          }
        />
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
          <p className="break-words text-lg font-bold text-foreground">
            {state.trackTitle ?? "재생 중인 곡이 없어요"}
          </p>
          <p className="break-words text-sm text-muted-foreground">
            {state.trackAuthor ?? "아티스트 정보 없음"}
            {state.requesterName ? ` · 신청: ${state.requesterName}` : ""}
          </p>
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            {state.isStream && <span>실시간 스트림</span>}
            {state.sourceName && (
              <span>
                {state.isStream ? "· " : ""}
                {prettySourceName(state.sourceName)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
            <ProgressBar state={unavailable ? { ...state, stale: true } : state} receivedAt={receivedAt} />
          <div className="flex items-center justify-between text-xs font-medium tabular-nums text-muted-foreground">
            <span>
              {state.isStream
                ? "스트리밍"
                : hasCurrentTrack
                  ? formatDuration(positionMs)
                  : "0:00"}
            </span>
            <span>{state.isStream ? "" : formatDuration(state.durationMs)}</span>
          </div>
        </div>

        {/* 실시간 컨트롤러 — 명령은 data-api Redis 브로드캐스트로 봇에 즉시 적용돼요 */}
        <div className="flex flex-wrap items-center gap-2 pt-3">
          <Button
            variant="secondary"
            size="sm"
            className="min-h-11"
            icon={displayedPaused ? <Play size={14} /> : <Pause size={14} />}
            onClick={handleTogglePause}
            loading={pendingAction === "pause" || pendingAction === "resume"}
            disabled={
              controlsDisabled || !hasCurrentTrack ||
              (pendingAction !== null &&
                pendingAction !== "pause" &&
                pendingAction !== "resume")
            }
            aria-label={displayedPaused ? "재생" : "일시정지"}
          >
            {displayedPaused ? "재생" : "일시정지"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="min-h-11"
            icon={<SkipForward size={14} />}
            onClick={handleSkip}
            loading={pendingAction === "skip"}
            disabled={
              controlsDisabled || !hasCurrentTrack ||
              state.queueLength === 0 ||
              (pendingAction !== null && pendingAction !== "skip")
            }
            aria-label="다음 곡"
          >
            스킵
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="min-h-11"
            icon={<Square size={14} />}
            onClick={handleStop}
            loading={pendingAction === "stop"}
            disabled={
              controlsDisabled || !hasCurrentTrack ||
              (pendingAction !== null && pendingAction !== "stop")
            }
            aria-label="정지"
          >
            정지
          </Button>
          <Button
            variant="state-toggle"
            size="sm"
            className="min-h-11"
            active={displayedRepeat !== "off"}
            icon={<Repeat size={14} />}
            onClick={handleRepeat}
            loading={pendingAction === "repeat"}
            disabled={
              controlsDisabled || !hasCurrentTrack ||
              (pendingAction !== null && pendingAction !== "repeat")
            }
            aria-label={`반복 설정: ${displayedRepeat === "off" ? "없음" : displayedRepeat === "track" ? "한 곡" : "대기열"}`}
          >
            {displayedRepeat === "off"
              ? "반복 안 함"
              : displayedRepeat === "track"
                ? "한 곡 반복"
                : "대기열 반복"}
          </Button>
          <div className="flex w-full min-w-0 items-center gap-2 pt-2 md:ml-auto md:w-56 md:pt-0">
            <Volume2
              size={16}
              className="shrink-0 text-muted-foreground"
              aria-hidden
            />
            <Slider
              className="min-w-0 flex-1"
              value={displayedVolume}
              min={0}
              max={PLAYER_VOLUME_MAX}
              step={1}
              onChange={handleVolumeChange}
              disabled={unavailable || volumePending || pendingAction !== null || !hasCurrentTrack}
              showValue
              formatValue={(value) => `${value}%`}
              label="볼륨"
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
        <EmptyState
          icon={ListMusic}
          size="sm"
          title="대기열이 비어 있어요"
          description="Discord에서 곡을 신청하면 여기에 표시돼요."
        />
      ) : (
        <ol className="space-y-2">
          {state.queue.map((track, index) => (
            <li
              key={`${track.title}-${index}`}
              className="animate-page-in flex items-center gap-3 rounded-card bg-surface-2 px-3 py-2 opacity-0"
              style={{
                animationDelay: `${Math.min(index, 9) * 40}ms`,
                animationFillMode: "forwards",
              }}
            >
              <span className="w-5 shrink-0 text-center text-sm font-black tabular-nums text-muted-foreground">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {track.title}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {track.author}
                  {track.requesterName ? ` · 신청: ${track.requesterName}` : ""}
                </p>
              </div>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {track.isStream ? "스트림" : formatDuration(track.durationMs)}
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
        description={
          detail ??
          "봇이 이 서버에서 음악을 재생하면 여기에 실시간 상태가 표시돼요."
        }
      />
    </Card>
  );
}

interface LivePayload {
  player: LivePlayerState | null;
  hub: { guilds: number; subscribed: boolean; staleMs: number };
}

async function liveFetcher(url: string): Promise<LivePayload> {
  const response = await fetch(url);
  if (!response.ok) throw await toApiError(response, "라이브 상태를 불러오지 못했어요.");
  return response.json();
}

/** 폴백 폴링 주기 — 2000ms면 READ_RATE(분당 30회) 경계에 딱 붙어 윈도우 지터로 429가 튀니 분당 24회로 낮춰요. */
const FALLBACK_POLL_INTERVAL_MS = 2500;

export default function PlayerLiveTab({ guildId }: { guildId: string }) {
  return <LivePlayerSession key={guildId} guildId={guildId} />;
}

function LivePlayerSession({ guildId }: { guildId: string }) {
  /** SSE 실패(미지원/장애) 시 폴백하는 폴링 모드와 상태를 구분해요. */
  const [mode, setMode] = useState<"stream" | "polling">("stream");
  const [liveData, setLiveData] = useState<LivePayload | null>(null);
  const [connected, setConnected] = useState(false);
  /** 마지막 상태 수신 시각 — 스냅샷 이후 경과를 보간하는 기준 */
  const [receivedAt, setReceivedAt] = useState<number>(Date.now());

  // 폴링 폴백 + 초기 데이터 — 항상 구독해 키/훅 순서를 유지해요 (stream 모드에선 0초 폴링).
  const {
    data: swrData,
    error,
    isLoading,
    mutate,
  } = useSWR<LivePayload>(`/api/servers/${guildId}/live`, liveFetcher, {
    refreshInterval: mode === "polling" ? FALLBACK_POLL_INTERVAL_MS : 0,
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
    let closed = false;

    source.addEventListener("state", (e) => {
      if (closed) return;
      try {
        const payload = JSON.parse((e as MessageEvent).data) as LivePayload;
        gotData = true;
        setReceivedAt(Date.now());
        setLiveData(payload);
        setConnected(true);
      } catch {
        // 잘못된 프레임 — 무시하고 다음 스냅샷을 기다려요.
      }
    });
    source.onerror = () => {
      if (closed) return;
      // data를 한 번도 못 받은 error → 스트림 미지원(프록시 404 등)으로 판단하고 폴링 폴백
      if (!gotData) {
        setMode("polling");
      } else {
        setConnected(false); // EventSource 내장 재연결에 맡긴다
      }
    };

    return () => { closed = true; source.close(); };
  }, [mode, guildId]);

  // 표시 데이터 — polling 모드에선 SWR 데이터를 사용해요.
  const data = mode === "stream" ? liveData ?? swrData : swrData;

  // 폴링 사이 progress 부드럽게 보간 (SSE 수신 사이 진행바 1초 보간)
  const [, tickState] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tickState((v) => v + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  if (error && (mode === "polling" || !liveData)) {
    const apiError = toError(error, "라이브 상태를 불러오지 못했어요.");
    return <PanelError error={apiError} onRetry={() => { void mutate(); }} />;
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
      {(data.player.stale || (mode === "stream" && !connected)) && (
        <p role="status" className="rounded-control bg-warning/5 px-4 py-3 text-sm text-warning">
          마지막으로 확인한 재생 정보예요. 연결을 확인하는 동안 재생 제어는 사용할 수 없어요.
        </p>
      )}
      <NowPlaying
        state={data.player}
        receivedAt={receivedAt}
        connected={connected}
        mode={mode}
        guildId={guildId}
      />
      <QueueList state={data.player} />
      <p className="text-xs text-muted-foreground">
        컨트롤러 명령은 봇이 음성 채널 접속 중일 때만 적용돼요. 검색·재생 ·
        기록은{" "}
        <Link
          href={`/player/${guildId}`}
          className="font-semibold text-primary-text hover:underline"
        >
          음악 플레이어 페이지
        </Link>
        에서 할 수 있어요.
      </p>
    </div>
  );
}
