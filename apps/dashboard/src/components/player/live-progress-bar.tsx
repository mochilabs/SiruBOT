"use client";

import { useEffect, useRef } from "react";

import type { LivePlayerState } from "@/app/api/servers/[id]/live/route";

export function interpolatedPositionMs(
  state: LivePlayerState,
  receivedAt: number,
): number {
  if (state.isStream || state.durationMs <= 0) return state.positionMs;
  if (state.stale || !state.playing || state.paused) return state.positionMs;
  const elapsed = Math.max(0, Date.now() - receivedAt);
  return Math.min(state.durationMs, state.positionMs + elapsed);
}

function positionRatio(state: LivePlayerState, receivedAt: number): number {
  if (state.durationMs <= 0) return 0;
  const positionMs = interpolatedPositionMs(state, receivedAt);
  return Math.min(1, Math.max(0, positionMs / state.durationMs));
}

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

  if (isIndeterminate) {
    return <div className="h-2 w-full rounded-full bg-surface-1" />;
  }

  return (
    <div
      role="progressbar"
      aria-label="재생 진행률"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(positionRatio(state, receivedAt) * 100)}
      className="h-2 w-full overflow-hidden rounded-full bg-surface-1"
    >
      <div
        ref={barRef}
        className="h-full rounded-full bg-primary-control"
        style={{ width: `${initialRatioRef.current * 100}%` }}
      />
    </div>
  );
}
