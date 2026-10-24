"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatDuration } from "@sirubot/utils/time";
import { ListMusic, Pause, Play, Repeat, SkipForward, Square, Volume2 } from "lucide-react";

import type { LivePlayerState } from "@/app/api/servers/[id]/live/route";
import { StatusDot } from "@/components/primitives/status-dot";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/components/ui/toast";
import { PLAYER_VOLUME_MAX } from "@/lib/player-constants";
import { playerErrorMessage } from "@/lib/player-error";
import { prettySourceName } from "@/utils";

import { interpolatedPositionMs, ProgressBar } from "./live-progress-bar";

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

interface NowPlayingProps {
  state: LivePlayerState;
  receivedAt: number;
  connected: boolean;
  mode: "stream" | "polling";
  guildId: string;
}

export function NowPlaying({
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
          {state.trackTitle && /^https?:\/\//i.test(state.trackUri ?? "") ? (
            <a
              href={state.trackUri!}
              target="_blank"
              rel="noopener noreferrer"
              className="break-words text-lg font-bold text-foreground hover:text-primary-text hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm transition-colors duration-fast"
            >
              {state.trackTitle}
            </a>
          ) : (
            <p className="break-words text-lg font-bold text-foreground">
              {state.trackTitle ?? "재생 중인 곡이 없어요"}
            </p>
          )}
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
