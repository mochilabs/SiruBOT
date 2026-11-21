"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { findActiveLineIndex, findActiveWordIndex } from "@sirubot/utils/lrc";
import { Mic2, Minus, Plus, RotateCcw } from "lucide-react";

import type { LivePlayerState } from "@/app/api/servers/[id]/live/route";
import type { LyricsPayload } from "@/app/api/servers/[id]/lyrics/route";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SkeletonLine } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api-error";
import { createApiFetcher, useGuildResource } from "@/lib/swr";
import { cn } from "@/lib/utils";

import { interpolatedPositionMs } from "./live-progress-bar";
import {
  clampLyricsOffset,
  formatLyricsOffset,
  type KaraokeLyrics,
  LYRICS_OFFSET_STEP_MS,
  lyricsEligible,
  lyricsQueryPath,
  lyricsTrackKey,
  readLyricsOffset,
  toKaraokeLyrics,
  writeLyricsOffset,
} from "./lyrics-sync";

/** 사용자가 직접 스크롤한 뒤 자동 스크롤을 멈춰 두는 시간 */
const USER_SCROLL_PAUSE_MS = 4000;

const lyricsFetcher = createApiFetcher<LyricsPayload>("가사를 불러오지 못했어요.");

interface LyricsPanelProps {
  state: LivePlayerState;
  receivedAt: number;
  guildId: string;
  /** 연결이 불안정하면 위치를 보간하지 않고 마지막 스냅샷에 둬요 */
  unavailable: boolean;
}

/**
 * 노래방 가사 — 현재 줄(과 단어)을 하이라이트하고 따라 스크롤해요.
 * 위치는 진행바와 같은 `interpolatedPositionMs` 보간을 매 프레임 읽어요.
 * 싱크가 없는 곡은 일반 가사를 그대로 보여줘요.
 */
export function LyricsPanel({ state, receivedAt, guildId, unavailable }: LyricsPanelProps) {
  const eligible = lyricsEligible(state);
  const path = lyricsQueryPath(state);
  const { data, error, isLoading } = useGuildResource<LyricsPayload>(guildId, path ?? "/lyrics", {
    fetcher: lyricsFetcher,
    enabled: path !== null,
  });
  const lyrics = useMemo(() => (data ? toKaraokeLyrics(data) : null), [data]);
  const trackKey = lyricsTrackKey(state);

  if (!eligible) return null;

  const notFound = !isLoading && (lyrics === null) && (error !== undefined || data !== undefined);
  const failedForOtherReason = error !== undefined && !(error instanceof ApiError && error.status === 404);

  return (
    <section aria-label="노래방 가사" className="flex flex-col gap-3 rounded-card bg-surface-2 p-3 sm:p-4">
      {isLoading || (!lyrics && !notFound) ? (
        <LyricsFrame>
          <div className="space-y-2" role="status" aria-label="가사 불러오는 중">
            <SkeletonLine width="60%" height="h-4" />
            <SkeletonLine width="80%" height="h-4" />
            <SkeletonLine width="45%" height="h-4" />
          </div>
        </LyricsFrame>
      ) : lyrics ? (
        <LyricsBody
          key={trackKey}
          lyrics={lyrics}
          state={state}
          receivedAt={receivedAt}
          unavailable={unavailable}
          trackKey={trackKey}
        />
      ) : (
        <LyricsFrame>
          <p className="text-sm text-muted-foreground">
            {failedForOtherReason ? "가사를 불러오지 못했어요." : "이 곡의 가사를 찾지 못했어요."}
          </p>
        </LyricsFrame>
      )}
    </section>
  );
}

function LyricsFrame({ children, badge, controls }: { children: React.ReactNode; badge?: React.ReactNode; controls?: React.ReactNode }) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Mic2 size={16} className="text-primary-text" aria-hidden />
          가사
          {badge}
        </div>
        {controls}
      </div>
      {children}
    </>
  );
}

function LyricsBody({
  lyrics,
  state,
  receivedAt,
  unavailable,
  trackKey,
}: {
  lyrics: KaraokeLyrics;
  state: LivePlayerState;
  receivedAt: number;
  unavailable: boolean;
  trackKey: string;
}) {
  const [offsetMs, setOffsetMs] = useState(0);
  const [activeLine, setActiveLine] = useState(-1);
  const [activeWord, setActiveWord] = useState(-1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<Array<HTMLLIElement | null>>([]);
  const pausedUntilRef = useRef(0);
  const firstScrollRef = useRef(true);

  // 저장된 오프셋은 브라우저에서만 읽을 수 있어 마운트 뒤에 적용해요 (곡이 바뀌면 이 컴포넌트가 새로 마운트돼요)
  useEffect(() => {
    setOffsetMs(readLyricsOffset(trackKey));
  }, [trackKey]);

  const changeOffset = useCallback(
    (next: number) => {
      const clamped = clampLyricsOffset(next);
      setOffsetMs(clamped);
      writeLyricsOffset(trackKey, clamped);
    },
    [trackKey],
  );

  // 매 프레임 위치를 읽어 현재 줄·단어만 state로 올려요 (같은 값이면 리렌더하지 않아요)
  const stateRef = useRef({ state, receivedAt, unavailable });
  stateRef.current = { state, receivedAt, unavailable };
  useEffect(() => {
    if (!lyrics.synced) return;
    let raf = 0;
    const tick = () => {
      const current = stateRef.current;
      const snapshot = current.unavailable ? { ...current.state, stale: true } : current.state;
      // 오프셋이 +면 가사가 더 빨리 나오도록 읽는 위치를 앞으로 당겨요
      const positionMs = interpolatedPositionMs(snapshot, current.receivedAt) + offsetMs;
      const line = findActiveLineIndex(lyrics.lines, positionMs);
      setActiveLine(line);
      const words = line >= 0 ? lyrics.lines[line]?.words : undefined;
      setActiveWord(words ? findActiveWordIndex(words, positionMs) : -1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [lyrics, offsetMs]);

  // 사용자가 직접 스크롤하면 잠깐 자동 스크롤을 멈춰요 (프로그램 스크롤은 wheel/touch 이벤트가 아니에요)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const pause = () => {
      pausedUntilRef.current = Date.now() + USER_SCROLL_PAUSE_MS;
    };
    container.addEventListener("wheel", pause, { passive: true });
    container.addEventListener("touchmove", pause, { passive: true });
    container.addEventListener("pointerdown", pause, { passive: true });
    container.addEventListener("keydown", pause);
    return () => {
      container.removeEventListener("wheel", pause);
      container.removeEventListener("touchmove", pause);
      container.removeEventListener("pointerdown", pause);
      container.removeEventListener("keydown", pause);
    };
  }, [lyrics.synced]);

  // 현재 줄이 바뀌면 컨테이너 가운데로 — 페이지 스크롤은 건드리지 않으려 컨테이너만 스크롤해요
  useEffect(() => {
    const container = containerRef.current;
    const element = lineRefs.current[activeLine];
    if (!container || !element || activeLine < 0) return;
    if (Date.now() < pausedUntilRef.current) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const top = element.offsetTop - container.clientHeight / 2 + element.clientHeight / 2;
    container.scrollTo({ top: Math.max(0, top), behavior: reduceMotion || firstScrollRef.current ? "auto" : "smooth" });
    firstScrollRef.current = false;
  }, [activeLine]);

  const badge = (
    <Badge size="sm" variant={lyrics.wordSync ? "primary" : "secondary"}>
      {lyrics.wordSync ? "단어 싱크" : lyrics.synced ? "줄 싱크" : "일반 가사"}
    </Badge>
  );

  const controls = lyrics.synced ? (
    <div className="flex items-center gap-1" role="group" aria-label="가사 싱크 조절">
      <Button
        variant="secondary"
        size="icon-xs"
        icon={<Minus size={12} />}
        aria-label="가사 0.5초 늦게"
        onClick={() => changeOffset(offsetMs - LYRICS_OFFSET_STEP_MS)}
        className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
      />
      <span aria-live="polite" className="w-14 text-center text-xs font-bold tabular-nums text-muted-foreground">
        {formatLyricsOffset(offsetMs)}
      </span>
      <Button
        variant="secondary"
        size="icon-xs"
        icon={<Plus size={12} />}
        aria-label="가사 0.5초 빠르게"
        onClick={() => changeOffset(offsetMs + LYRICS_OFFSET_STEP_MS)}
        className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
      />
      <Button
        variant="ghost"
        size="icon-xs"
        icon={<RotateCcw size={12} />}
        aria-label="가사 싱크 초기화"
        disabled={offsetMs === 0}
        onClick={() => changeOffset(0)}
        className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
      />
    </div>
  ) : null;

  return (
    <LyricsFrame badge={badge} controls={controls}>
      <div
        ref={containerRef}
        tabIndex={0}
        aria-label="가사 목록"
        className="relative h-60 overflow-y-auto rounded-control bg-surface-1 px-4 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-72"
      >
        {lyrics.synced ? (
          <ol className="space-y-3 py-[6.5rem] text-center sm:py-32">
            {lyrics.lines.map((line, index) => {
              const active = index === activeLine;
              if (!line.text) {
                return (
                  <li
                    key={index}
                    ref={(el) => {
                      lineRefs.current[index] = el;
                    }}
                    aria-hidden
                    className="text-base text-muted-foreground/40"
                  >
                    ♪
                  </li>
                );
              }
              return (
                <li
                  key={index}
                  ref={(el) => {
                    lineRefs.current[index] = el;
                  }}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "text-balance break-words text-base transition-colors duration-fast sm:text-lg",
                    active ? "font-bold text-foreground" : "font-medium text-muted-foreground/60",
                  )}
                >
                  {active && line.words && line.words.length > 0
                    ? line.words.map((word, wordIndex) => (
                        <span
                          key={wordIndex}
                          className={cn("transition-colors duration-fast", wordIndex <= activeWord ? "text-primary-text" : "text-muted-foreground")}
                        >
                          {word.text}
                        </span>
                      ))
                    : line.text}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="whitespace-pre-wrap break-words text-center text-sm leading-relaxed text-foreground">{lyrics.plainText}</p>
        )}
      </div>
    </LyricsFrame>
  );
}
