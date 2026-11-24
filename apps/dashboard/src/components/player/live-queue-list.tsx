"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PlayerWebControlAction } from "@sirubot/utils/playerWeb";
import { formatDuration } from "@sirubot/utils/time";
import { ChevronDown, ChevronUp, ListMusic, MoreVertical, Play, Shuffle, Trash2, X } from "lucide-react";

import type { LivePlayerState } from "@/app/api/servers/[id]/live/route";
import { EmptyState } from "@/components/primitives/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/toast";

import {
  CONTROL_BLOCKED_HINT,
  type PlayerCommandParams,
  sendPlayerCommand,
  VOICE_CONTEXT_REFRESH_MS,
} from "./player-command";
import { useVoiceContext } from "./voice-context";

interface QueueListProps {
  state: LivePlayerState;
  guildId: string;
  unavailable?: boolean;
}

export function QueueList({ state, guildId, unavailable = false }: QueueListProps) {
  const toast = useToast();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const { data: voiceData, mutate: refreshVoiceContext } = useVoiceContext(guildId, {
    refreshInterval: VOICE_CONTEXT_REFRESH_MS,
  });
  const controlBlocked = voiceData?.voice ? !voiceData.voice.canControl : false;
  // 명령 성공 후 새 상태가 도착할 때까지(또는 시간 초과) 행 조작을 잠가 옛 인덱스 재명령을 막아요.
  const [awaitingState, setAwaitingState] = useState(false);
  const controlsDisabled = unavailable || controlBlocked || pendingKey !== null || awaitingState;

  const rowKeys = useMemo(() => {
    const seen = new Map<string, number>();
    return state.queue.map((track) => {
      const base = track.uri || track.title;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      return `${base}#${n}`;
    });
  }, [state.queue]);
  const queueSignature = `${state.queueLength}|${rowKeys.join("|")}`;

  // 입장 애니메이션은 첫 마운트에만 적용해요.
  const animateEntry = useRef(true);
  useEffect(() => {
    animateEntry.current = false;
  }, []);

  useEffect(() => {
    if (!awaitingState) return;
    const timer = setTimeout(() => setAwaitingState(false), 4000);
    return () => clearTimeout(timer);
  }, [awaitingState]);
  useEffect(() => {
    setAwaitingState(false);
  }, [queueSignature]);

  const totalMs = state.queue.reduce((sum, track) => sum + (track.isStream ? 0 : track.durationMs), 0);
  const hiddenCount = Math.max(0, state.queueLength - state.queue.length);

  async function runQueueAction(
    key: string,
    action: PlayerWebControlAction,
    params?: PlayerCommandParams,
    successMessage?: string,
  ) {
    if (controlsDisabled) return;
    setPendingKey(key);
    setConfirmClear(false);
    try {
      const result = await sendPlayerCommand(guildId, action, params);
      if (!result.ok) {
        toast.error(result.message ?? "명령을 전달하지 못했어요.");
        void refreshVoiceContext();
        return;
      }
      if (successMessage) toast.success(successMessage);
      setAwaitingState(true);
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-foreground">대기열</h3>
          <Badge variant="primary" size="sm">
            {state.queueLength}곡{totalMs > 0 ? ` · ${formatDuration(totalMs)}` : ""}
          </Badge>
        </div>

        {state.queue.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Button
              variant="secondary"
              size="sm"
              icon={<Shuffle size={14} />}
              loading={pendingKey === "shuffle"}
              disabled={controlsDisabled || state.queueLength < 2}
              title={controlBlocked ? CONTROL_BLOCKED_HINT : "대기열 섞기"}
              onClick={() => void runQueueAction("shuffle", "queue-shuffle", undefined, "대기열을 섞었어요.")}
            >
              셔플
            </Button>
            {confirmClear ? (
              <div className="flex items-center gap-1">
                <Button
                  variant="danger"
                  size="sm"
                  loading={pendingKey === "clear"}
                  disabled={controlsDisabled}
                  onClick={() => void runQueueAction("clear", "queue-clear", undefined, "대기열을 비웠어요.")}
                >
                  비우기 확인
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pendingKey !== null}
                  onClick={() => setConfirmClear(false)}
                >
                  취소
                </Button>
              </div>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                icon={<Trash2 size={14} />}
                disabled={controlsDisabled}
                title={controlBlocked ? CONTROL_BLOCKED_HINT : "대기열 비우기"}
                onClick={() => setConfirmClear(true)}
              >
                비우기
              </Button>
            )}
          </div>
        )}
      </div>

      {controlBlocked && state.queue.length > 0 && (
        <p className="text-xs text-muted-foreground">{CONTROL_BLOCKED_HINT}</p>
      )}

      {state.queue.length === 0 ? (
        <EmptyState
          icon={ListMusic}
          size="sm"
          title="대기열이 비어 있어요"
          description="Discord에서 곡을 신청하면 여기에 표시돼요."
        />
      ) : (
        <ol className="max-h-[26rem] space-y-2 overflow-y-auto scrollbar-none">
          {state.queue.map((track, index) => (
            <li
              key={rowKeys[index]}
              className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-row bg-surface-2 p-2.5 ${animateEntry.current ? "animate-page-in opacity-0" : ""}`}
              style={
                animateEntry.current
                  ? { animationDelay: `${Math.min(index, 9) * 40}ms`, animationFillMode: "forwards" }
                  : undefined
              }
            >
              <span className="w-5 shrink-0 text-center text-sm font-extrabold tabular-nums text-muted-foreground">
                {index + 1}
              </span>
              {track.artworkUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={track.artworkUrl} alt="" className="h-11 w-11 shrink-0 rounded-control-inner object-cover" />
              ) : (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control-inner bg-surface-1 text-muted-foreground">
                  <ListMusic size={16} aria-hidden />
                </div>
              )}
              <div className="min-w-0 flex-1 basis-32">
                <div className="flex min-w-0 items-center gap-2">
                  {/^https?:\/\//i.test(track.uri ?? "") ? (
                    <a
                      href={track.uri!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-sm font-semibold text-foreground hover:text-primary-text hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm transition-colors duration-fast"
                    >
                      {track.title}
                    </a>
                  ) : (
                    <p className="truncate text-sm font-semibold text-foreground">
                      {track.title}
                    </p>
                  )}
                  {index === 0 && (
                    <Badge variant="primary" size="sm" className="shrink-0">
                      다음
                    </Badge>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {track.author}
                  {track.requesterName ? ` · 신청: ${track.requesterName}` : ""}
                </p>
              </div>
              <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:inline">
                {track.isStream ? "스트림" : formatDuration(track.durationMs)}
              </span>
              <div className="ml-auto hidden shrink-0 items-center gap-0.5 sm:flex">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                  icon={<Play size={14} />}
                  loading={pendingKey === `jump-${index}`}
                  disabled={controlsDisabled}
                  title={controlBlocked ? CONTROL_BLOCKED_HINT : "이 곡 바로 재생"}
                  aria-label={`${track.title} 바로 재생`}
                  onClick={() => void runQueueAction(`jump-${index}`, "queue-jump", { index })}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                  icon={<ChevronUp size={14} />}
                  loading={pendingKey === `up-${index}`}
                  disabled={controlsDisabled || index === 0}
                  title={controlBlocked ? CONTROL_BLOCKED_HINT : "위로 이동"}
                  aria-label={`${track.title} 위로 이동`}
                  onClick={() => void runQueueAction(`up-${index}`, "queue-move", { from: index, to: index - 1 }, "순서를 바꿨어요.")}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                  icon={<ChevronDown size={14} />}
                  loading={pendingKey === `down-${index}`}
                  disabled={controlsDisabled || index === state.queue.length - 1}
                  title={controlBlocked ? CONTROL_BLOCKED_HINT : "아래로 이동"}
                  aria-label={`${track.title} 아래로 이동`}
                  onClick={() => void runQueueAction(`down-${index}`, "queue-move", { from: index, to: index + 1 }, "순서를 바꿨어요.")}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                  icon={<X size={14} />}
                  loading={pendingKey === `remove-${index}`}
                  disabled={controlsDisabled}
                  title={controlBlocked ? CONTROL_BLOCKED_HINT : "대기열에서 제거"}
                  aria-label={`${track.title} 대기열에서 제거`}
                  onClick={() => void runQueueAction(`remove-${index}`, "queue-remove", { index }, "대기열에서 뺐어요.")}
                />
              </div>
              {/* 모바일은 버튼 네 개가 행을 차지해서 더보기 메뉴 하나로 묶어요 */}
              <div className="ml-auto shrink-0 sm:hidden">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                        icon={<MoreVertical size={16} />}
                        disabled={controlsDisabled}
                        title={controlBlocked ? CONTROL_BLOCKED_HINT : undefined}
                        aria-label={`${track.title} 메뉴`}
                      />
                    }
                  />
                  <DropdownMenuContent align="end">
                    <DropdownMenuGroup>
                      <DropdownMenuItem onClick={() => void runQueueAction(`jump-${index}`, "queue-jump", { index })}>
                        <Play size={14} />
                        바로 재생
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={index === 0}
                        onClick={() => void runQueueAction(`up-${index}`, "queue-move", { from: index, to: index - 1 }, "순서를 바꿨어요.")}
                      >
                        <ChevronUp size={14} />
                        위로 이동
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={index === state.queue.length - 1}
                        onClick={() => void runQueueAction(`down-${index}`, "queue-move", { from: index, to: index + 1 }, "순서를 바꿨어요.")}
                      >
                        <ChevronDown size={14} />
                        아래로 이동
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => void runQueueAction(`remove-${index}`, "queue-remove", { index }, "대기열에서 뺐어요.")}
                      >
                        <X size={14} />
                        대기열에서 제거
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          ))}
          {hiddenCount > 0 && (
            <li className="px-3 py-2 text-center text-xs text-muted-foreground">외 {hiddenCount}곡이 더 대기 중이에요</li>
          )}
        </ol>
      )}
    </section>
  );
}
