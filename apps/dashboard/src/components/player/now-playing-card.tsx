"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatDuration } from "@sirubot/utils/time";
import { Heart, ListMusic, Pause, Play, Repeat, SkipForward, Square, Volume2 } from "lucide-react";

import type { LivePlayerState } from "@/app/api/servers/[id]/live/route";
import { StatusDot } from "@/components/primitives/status-dot";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/components/ui/toast";
import { PLAYER_VOLUME_MAX } from "@/lib/player-constants";
import { prettySourceName } from "@/utils";

import { interpolatedPositionMs, ProgressBar } from "./live-progress-bar";
import { CONTROL_BLOCKED_HINT, sendPlayerCommand, VOICE_CONTEXT_REFRESH_MS } from "./player-command";
import { useVoiceContext } from "./voice-context";

/** 볼륨 슬라이더 값을 서버로 보내기 전 모으는 디바운스 — 드래그 중 연타를 막아요 */
const VOLUME_SEND_DEBOUNCE_MS = 400;

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
  const volumeHoldRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [volumePending, setVolumePending] = useState(false);
  // 봇이 실제 인가와 같은 정책으로 계산한 제어 가능 여부예요. 값을 모르면(로딩·오류) 열어 두고 봇의 거절 안내에 맡겨요.
  const { data: voiceData, mutate: refreshVoiceContext } = useVoiceContext(guildId, {
    refreshInterval: VOICE_CONTEXT_REFRESH_MS,
  });
  const controlBlocked = voiceData?.voice ? !voiceData.voice.canControl : false;
  // 명령 응답 뒤에도 새 상태가 도착할 때까지(또는 시간 초과) 잠가 같은 명령 중복을 막아요.
  const stateSignature = `${state.paused}|${state.repeatMode}|${Math.round(state.volume)}|${state.trackUri ?? ""}|${state.playing}`;
  const [settlingSignature, setSettlingSignature] = useState<string | null>(null);
  const settling = settlingSignature !== null && settlingSignature === stateSignature;
  useEffect(() => {
    if (settlingSignature === null) return;
    const timer = setTimeout(() => setSettlingSignature(null), 3000);
    return () => clearTimeout(timer);
  }, [settlingSignature]);
  useEffect(() => {
    if (settlingSignature !== null && settlingSignature !== stateSignature) setSettlingSignature(null);
  }, [settlingSignature, stateSignature]);
  const controlsDisabled = unavailable || volumePending || volumeOverride !== null || controlBlocked || settling;

  // 곡이 바뀌면 봇의 음성 채널도 바뀌었을 수 있어 바로 다시 확인해요
  useEffect(() => {
    void refreshVoiceContext();
  }, [refreshVoiceContext, state.trackUri]);

  useEffect(() => {
    if (unavailable) {
      if (volumeTimerRef.current) clearTimeout(volumeTimerRef.current);
      setVolumeOverride(null);
    }
  }, [unavailable]);
  useEffect(() => {
    return () => {
      if (volumeTimerRef.current) clearTimeout(volumeTimerRef.current);
      if (volumeHoldRef.current) clearTimeout(volumeHoldRef.current);
    };
  }, []);
  // 서버 볼륨이 보낸 값에 도달하면 override를 풀어요 (전송 중에는 유지)
  useEffect(() => {
    if (volumeOverride !== null && !volumePending && Math.round(state.volume) === volumeOverride) {
      if (volumeHoldRef.current) clearTimeout(volumeHoldRef.current);
      setVolumeOverride(null);
    }
  }, [state.volume, volumeOverride, volumePending]);

  const stateSignatureRef = useRef(stateSignature);
  stateSignatureRef.current = stateSignature;
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
    if (result.ok) setSettlingSignature(stateSignatureRef.current);
    setPendingAction(null);
    commandPendingRef.current = false;
  }, [controlsDisabled, displayedPaused, failCommand, guildId]);

  const handleSkip = useCallback(async () => {
    if (commandPendingRef.current || controlsDisabled) return;
    commandPendingRef.current = true;
    setPendingAction("skip");
    const result = await sendPlayerCommand(guildId, "skip");
    if (!result.ok) failCommand(result, "명령을 전달하지 못했어요.");
    if (result.ok) setSettlingSignature(stateSignatureRef.current);
    setPendingAction(null);
    commandPendingRef.current = false;
  }, [controlsDisabled, failCommand, guildId]);

  const handleStop = useCallback(async () => {
    if (commandPendingRef.current || controlsDisabled) return;
    commandPendingRef.current = true;
    setPendingAction("stop");
    const result = await sendPlayerCommand(guildId, "stop");
    if (!result.ok) failCommand(result, "정지하지 못했어요.");
    if (result.ok) setSettlingSignature(stateSignatureRef.current);
    setPendingAction(null);
    commandPendingRef.current = false;
  }, [controlsDisabled, failCommand, guildId]);

  const handleRepeat = useCallback(async () => {
    if (commandPendingRef.current || controlsDisabled) return;
    commandPendingRef.current = true;
    setPendingAction("repeat");
    const result = await sendPlayerCommand(guildId, "repeat");
    if (!result.ok) failCommand(result, "반복 설정을 바꾸지 못했어요.");
    if (result.ok) setSettlingSignature(stateSignatureRef.current);
    setPendingAction(null);
    commandPendingRef.current = false;
  }, [controlsDisabled, failCommand, guildId]);

  const handleVolumeChange = useCallback(
    (volume: number) => {
      if (unavailable || controlBlocked || volumePendingRef.current || commandPendingRef.current) return;
      setVolumeOverride(volume);
      if (volumeTimerRef.current) clearTimeout(volumeTimerRef.current);
      if (volumeHoldRef.current) clearTimeout(volumeHoldRef.current);
      volumeTimerRef.current = setTimeout(async () => {
        volumePendingRef.current = true;
        setVolumePending(true);
        const result = await sendPlayerCommand(guildId, "volume", volume);
        if (!result.ok) failCommand(result, "볼륨을 적용하지 못했어요.");
        if (!result.ok) {
          setVolumeOverride(null);
        } else {
          volumeHoldRef.current = setTimeout(() => setVolumeOverride(null), 3000);
        }
        volumePendingRef.current = false;
        setVolumePending(false);
      }, VOLUME_SEND_DEBOUNCE_MS);
    },
    [controlBlocked, failCommand, guildId, unavailable],
  );

  const statusLabel =
    unavailable ? "연결 확인 중" : state.paused ? "일시정지" : state.playing ? "재생 중" : "대기 중";
  const repeatLabel =
    displayedRepeat === "off" ? "반복 안 함" : displayedRepeat === "track" ? "한 곡 반복" : "대기열 반복";
  const busy = (own: NonNullable<typeof pendingAction>[]) =>
    pendingAction !== null && !own.includes(pendingAction);
  const commandsOff = controlsDisabled || !hasCurrentTrack;

  // 탐색 — 위치를 고르면 바로 이동하지 않고 확인 단계를 거쳐요
  const [seekTargetMs, setSeekTargetMs] = useState<number | null>(null);
  const [seekPending, setSeekPending] = useState(false);
  const canSeek = !state.isStream && state.durationMs > 0 && !commandsOff;
  // 곡이 바뀌면 이전 곡 기준으로 고른 위치는 버려요
  useEffect(() => {
    setSeekTargetMs(null);
  }, [state.trackUri]);
  useEffect(() => {
    if (!canSeek) setSeekTargetMs(null);
  }, [canSeek]);

  const handleSeekConfirm = useCallback(async () => {
    if (seekTargetMs === null || commandPendingRef.current || controlsDisabled) return;
    commandPendingRef.current = true;
    setSeekPending(true);
    const result = await sendPlayerCommand(guildId, "seek", { positionMs: seekTargetMs });
    if (!result.ok) {
      failCommand(result, "재생 위치를 옮기지 못했어요.");
    } else {
      setSeekTargetMs(null);
    }
    setSeekPending(false);
    commandPendingRef.current = false;
  }, [controlsDisabled, failCommand, guildId, seekTargetMs]);

  // 즐겨찾기 — 현재 곡을 내 즐겨찾기에 담아요
  const [favoritePending, setFavoritePending] = useState(false);
  const handleFavorite = useCallback(async () => {
    if (favoritePending || !state.trackUri) return;
    setFavoritePending(true);
    try {
      const res = await fetch(`/api/servers/${guildId}/player/favorite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uri: state.trackUri }),
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        alreadyAdded?: boolean;
      } | null;
      if (res.ok) toast.success("즐겨찾기에 추가했어요.");
      else if (body?.alreadyAdded) toast.info("이미 즐겨찾기에 있는 곡이에요.");
      else toast.error(body?.error ?? "즐겨찾기에 추가하지 못했어요.");
    } catch {
      toast.error("즐겨찾기에 추가하지 못했어요.");
    } finally {
      setFavoritePending(false);
    }
  }, [favoritePending, guildId, state.trackUri, toast]);

  return (
    <section className="flex flex-col gap-3 rounded-row bg-surface-2 p-3 sm:p-4">
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        {/* 아트워크 — 다음/이미지 도메인 없이 일반 img로 렌더 (외부 CDN 다양성) */}
        {state.artworkUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={state.artworkUrl}
            alt=""
            className="h-16 w-16 shrink-0 rounded-control object-cover sm:h-20 sm:w-20"
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-control bg-surface-1 text-muted-foreground sm:h-20 sm:w-20">
            <ListMusic size={24} />
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex min-w-0 items-center justify-between gap-2 text-sm">
            <StatusDot
              size="sm"
              status={unavailable ? "disconnected" : state.paused ? "idle" : state.playing ? "ready" : "disconnected"}
              label={statusLabel}
            />
            {state.sourceName && (
              <span className="shrink-0 text-xs font-medium text-muted-foreground">
                {state.isStream ? "실시간 스트림 · " : ""}
                {prettySourceName(state.sourceName)}
              </span>
            )}
          </div>
          {state.trackTitle && /^https?:\/\//i.test(state.trackUri ?? "") ? (
            <a
              href={state.trackUri!}
              target="_blank"
              rel="noopener noreferrer"
              className="line-clamp-1 break-words text-lg font-extrabold tracking-tight text-foreground hover:text-primary-text hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm transition-colors duration-fast"
            >
              {state.trackTitle}
            </a>
          ) : (
            <p className="line-clamp-1 break-words text-lg font-extrabold tracking-tight text-foreground">
              {state.trackTitle ?? "재생 중인 곡이 없어요"}
            </p>
          )}
          <p className="truncate text-sm text-muted-foreground">
            {state.trackAuthor ?? "아티스트 정보 없음"}
            {state.requesterName ? ` · 신청: ${state.requesterName}` : ""}
          </p>
        </div>
      </div>

      <div className="space-y-1">
        <div className="relative">
          <ProgressBar state={unavailable ? { ...state, stale: true } : state} receivedAt={receivedAt} />
          {canSeek && (
            // 보이지 않는 범위 입력을 진행바 위에 겹쳐 마우스·터치·키보드 탐색을 모두 받아요
            <input
              type="range"
              aria-label="재생 위치 선택"
              min={0}
              max={state.durationMs}
              step={1000}
              value={seekTargetMs ?? Math.min(positionMs, state.durationMs)}
              onChange={(event) => setSeekTargetMs(Number(event.target.value))}
              disabled={seekPending}
              className="absolute -top-2 left-0 h-5 w-full cursor-pointer opacity-0 pointer-coarse:-top-3 pointer-coarse:h-8"
            />
          )}
        </div>
        {seekTargetMs !== null && (
          <div role="group" aria-label="재생 위치 이동 확인" className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-surface-1 px-3 py-2">
            <p className="text-sm font-medium text-foreground">
              <span className="font-bold tabular-nums">{formatDuration(seekTargetMs)}</span> 위치로 이동할까요?
            </p>
            <div className="flex items-center gap-2">
              <Button variant="primary" size="sm" className="pointer-coarse:min-h-11" onClick={handleSeekConfirm} loading={seekPending} disabled={seekPending}>
                이동
              </Button>
              <Button variant="secondary" size="sm" className="pointer-coarse:min-h-11" onClick={() => setSeekTargetMs(null)} disabled={seekPending}>
                취소
              </Button>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between text-xs font-medium tabular-nums text-muted-foreground">
          <span>{state.isStream ? "스트리밍" : hasCurrentTrack ? formatDuration(positionMs) : "0:00"}</span>
          <span>{state.isStream ? "" : formatDuration(state.durationMs)}</span>
        </div>
      </div>

      {/* 실시간 컨트롤러 — 명령은 data-api Redis 브로드캐스트로 봇에 즉시 적용돼요 */}
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-2"
        title={controlBlocked ? CONTROL_BLOCKED_HINT : undefined}
      >
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="icon-lg"
            className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
            icon={displayedPaused ? <Play size={18} /> : <Pause size={18} />}
            onClick={handleTogglePause}
            loading={pendingAction === "pause" || pendingAction === "resume"}
            disabled={commandsOff || busy(["pause", "resume"])}
            aria-label={displayedPaused ? "재생" : "일시정지"}
          />
          <Button
            variant="secondary"
            size="icon-lg"
            className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
            icon={<SkipForward size={16} />}
            onClick={handleSkip}
            loading={pendingAction === "skip"}
            disabled={commandsOff || busy(["skip"])}
            aria-label="다음 곡"
          />
          <Button
            variant="secondary"
            size="icon-lg"
            className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
            icon={<Square size={16} />}
            onClick={handleStop}
            loading={pendingAction === "stop"}
            disabled={commandsOff || busy(["stop"])}
            aria-label="정지"
          />
          <Button
            variant="secondary"
            size="icon-lg"
            className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
            icon={<Heart size={16} />}
            onClick={handleFavorite}
            loading={favoritePending}
            disabled={favoritePending || !state.trackUri || !hasCurrentTrack}
            aria-label="즐겨찾기에 추가"
            title="즐겨찾기에 추가"
          />
          <Button
            variant="state-toggle"
            size="sm"
            className="pointer-coarse:min-h-11"
            active={displayedRepeat !== "off"}
            icon={<Repeat size={14} />}
            onClick={handleRepeat}
            loading={pendingAction === "repeat"}
            disabled={commandsOff || busy(["repeat"])}
          >
            {repeatLabel}
          </Button>
        </div>
        <div className="flex min-w-0 flex-1 basis-48 items-center gap-2 sm:max-w-60 sm:ml-auto">
          <Volume2 size={16} className="shrink-0 text-muted-foreground" aria-hidden />
          <Slider
            className="min-w-0 flex-1"
            value={displayedVolume}
            min={0}
            max={PLAYER_VOLUME_MAX}
            step={1}
            onChange={handleVolumeChange}
            disabled={unavailable || controlBlocked || volumePending || pendingAction !== null || !hasCurrentTrack}
            showValue={false}
            label="볼륨"
            hideLabel
          />
          <span className="w-9 shrink-0 text-right text-xs font-bold tabular-nums text-muted-foreground">
            {displayedVolume}%
          </span>
        </div>
      </div>
      {controlBlocked && (
        <p role="status" className="text-xs text-muted-foreground">
          {CONTROL_BLOCKED_HINT}
        </p>
      )}
    </section>
  );
}
