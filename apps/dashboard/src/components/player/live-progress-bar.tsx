"use client";

import { useEffect, useRef } from "react";

import type { LivePlayerState } from "@/app/api/servers/[id]/live/route";

/**
 * 마지막 스냅샷 이후 경과 보간 — 재생 중이면 position + 경과, 아니면 스냅샷 그대로.
 */
export function interpolatedPositionMs(
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
export function ProgressBar({
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
