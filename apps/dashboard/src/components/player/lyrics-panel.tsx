"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { findActiveLineIndex } from "@sirubot/utils/lrc";
import { ChevronDown, Loader2, Mic2 } from "lucide-react";

import type { LivePlayerState } from "@/app/api/servers/[id]/live/route";
import type { LyricsPayload } from "@/app/api/servers/[id]/lyrics/route";
import { createApiFetcher, useGuildResource } from "@/lib/swr";
import { cn } from "@/lib/utils";

import { interpolatedPositionMs } from "./live-progress-bar";
import {
  type KaraokeLyrics,
  LYRICS_TRANSLATION_POLL_MS,
  LYRICS_VIEW_MODES,
  lyricsEligible,
  lyricsQueryPath,
  lyricsTrackKey,
  type LyricsViewMode,
  readLyricsViewMode,
  toKaraokeLyrics,
  translatedLine,
  writeLyricsViewMode,
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
 * 노래방 가사 — 현재 줄을 하이라이트하고 따라 스크롤해요.
 * 위치는 진행바와 같은 `interpolatedPositionMs` 보간을 매 프레임 읽어요.
 * 싱크가 없는 곡은 일반 가사를 그대로 보여줘요.
 */
export function LyricsPanel({ state, receivedAt, guildId, unavailable }: LyricsPanelProps) {
  const eligible = lyricsEligible(state);
  const path = lyricsQueryPath(state);
  const { data, error, isLoading, isValidating } = useGuildResource<LyricsPayload>(guildId, path ?? "/lyrics", {
    fetcher: lyricsFetcher,
    enabled: path !== null,
    // 서버가 뒤에서 번역하는 동안만 다시 물어봐요
    refreshInterval: (latest) => (latest?.translation?.status === "pending" ? LYRICS_TRANSLATION_POLL_MS : 0),
  });
  const lyrics = useMemo(() => (data ? toKaraokeLyrics(data) : null), [data]);
  const trackKey = lyricsTrackKey(state);
  const [openOverride, setOpenOverride] = useState<{ trackKey: string; open: boolean } | null>(null);

  if (!eligible) return null;

  // 응답이 오거나 재시도가 끝나 에러가 확정되면 "없음"으로 보여줘요. 그 전까지는 찾는 중이에요.
  const finished = !isLoading && !isValidating && (data !== undefined || error !== undefined);

  // 가사가 있을 때만 접고 펼 수 있어요. 있으면 기본으로 열려 있고, 사용자가 누른 상태는 곡이 바뀌면 다시 자동 규칙을 따라요.
  const toggleable = lyrics !== null;
  const open = toggleable && (openOverride?.trackKey === trackKey ? openOverride.open : true);
  const bodyId = `lyrics-body-${trackKey}`;
  const status = lyrics ? null : finished ? "가사가 없어요." : "찾는 중…";

  return (
    <section aria-label="노래방 가사" className="flex flex-col gap-3 rounded-row bg-surface-2 p-3 sm:p-4">
      <button
        type="button"
        aria-expanded={toggleable ? open : undefined}
        aria-controls={toggleable ? bodyId : undefined}
        disabled={!toggleable}
        onClick={() => setOpenOverride({ trackKey, open: !open })}
        className="flex min-h-7 w-full cursor-pointer items-center justify-between gap-2 rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default pointer-coarse:min-h-11"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Mic2 size={16} className="text-primary-text" aria-hidden />
          가사
          {status && (
            <span role="status" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              {!finished && <Loader2 size={12} className="animate-spin motion-reduce:animate-none" aria-hidden />}
              {status}
            </span>
          )}
        </span>
        {toggleable && (
          <ChevronDown
            size={16}
            aria-hidden
            className={cn("text-muted-foreground transition-transform duration-fast motion-reduce:transition-none", open && "rotate-180")}
          />
        )}
      </button>
      {lyrics &&
        (open ? (
          <div id={bodyId} className="flex flex-col gap-3">
            <LyricsBody
              key={trackKey}
              lyrics={lyrics}
              translation={data?.translation}
              state={state}
              receivedAt={receivedAt}
              unavailable={unavailable}
            />
          </div>
        ) : (
          <CollapsedLine
            id={bodyId}
            lyrics={lyrics}
            translation={data?.translation}
            state={state}
            receivedAt={receivedAt}
            unavailable={unavailable}
          />
        ))}
    </section>
  );
}

/** 접힌 가사 — 지금 부르는 줄(싱크 없으면 첫 줄) 한 줄만 보여줘요 */
function CollapsedLine({
  id,
  lyrics,
  translation,
  state,
  receivedAt,
  unavailable,
}: {
  id: string;
  lyrics: KaraokeLyrics;
  translation: LyricsPayload["translation"];
  state: LivePlayerState;
  receivedAt: number;
  unavailable: boolean;
}) {
  const [activeLine, setActiveLine] = useState(-1);
  const stateRef = useRef({ state, receivedAt, unavailable });
  stateRef.current = { state, receivedAt, unavailable };
  useEffect(() => {
    if (!lyrics.synced) return;
    let raf = 0;
    const tick = () => {
      const current = stateRef.current;
      const snapshot = current.unavailable ? { ...current.state, stale: true } : current.state;
      setActiveLine(findActiveLineIndex(lyrics.lines, interpolatedPositionMs(snapshot, current.receivedAt)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [lyrics]);

  const text = lyrics.synced
    ? (lyrics.lines[activeLine]?.text ?? "")
    : (lyrics.plainText.split(/\r?\n/).find((line) => line.trim()) ?? "");
  const translated = text && translation?.status === "ready" ? translatedLine(translation.lines, text) : null;

  return (
    <div id={id} aria-live="off" className="min-h-6 rounded-control-inner bg-surface-1 px-3 py-2 text-center">
      <p className="truncate text-sm font-semibold text-foreground">{text || "♪"}</p>
      {translated && <p className="truncate text-xs text-muted-foreground">{translated}</p>}
    </div>
  );
}

function LyricsFrame({ children, controls }: { children: React.ReactNode; controls?: React.ReactNode }) {
  return (
    <>
      {controls && <div className="flex flex-wrap items-center justify-end gap-2">{controls}</div>}
      {children}
    </>
  );
}

function LyricsBody({
  lyrics,
  translation,
  state,
  receivedAt,
  unavailable,
}: {
  lyrics: KaraokeLyrics;
  translation: LyricsPayload["translation"];
  state: LivePlayerState;
  receivedAt: number;
  unavailable: boolean;
}) {
  const translationLines = translation?.status === "ready" ? translation.lines : null;
  const translationPending = translation?.status === "pending";
  const [viewMode, setViewMode] = useState<LyricsViewMode>("both");
  useEffect(() => {
    setViewMode(readLyricsViewMode());
  }, []);
  const changeViewMode = (mode: LyricsViewMode) => {
    setViewMode(mode);
    writeLyricsViewMode(mode);
  };
  const showOriginal = !translationLines || viewMode !== "translation";
  const showTranslation = Boolean(translationLines) && viewMode !== "original";
  const [activeLine, setActiveLine] = useState(-1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<Array<HTMLLIElement | null>>([]);
  const pausedUntilRef = useRef(0);
  const firstScrollRef = useRef(true);

  // 매 프레임 위치를 읽어 현재 줄만 state로 올려요 (같은 값이면 리렌더하지 않아요)
  const stateRef = useRef({ state, receivedAt, unavailable });
  stateRef.current = { state, receivedAt, unavailable };
  useEffect(() => {
    if (!lyrics.synced) return;
    let raf = 0;
    const tick = () => {
      const current = stateRef.current;
      const snapshot = current.unavailable ? { ...current.state, stale: true } : current.state;
      setActiveLine(findActiveLineIndex(lyrics.lines, interpolatedPositionMs(snapshot, current.receivedAt)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [lyrics]);

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

  const viewToggle = translationLines ? (
    <div role="radiogroup" aria-label="가사 보기 방식" className="flex items-center rounded-control bg-surface-1 p-0.5">
      {LYRICS_VIEW_MODES.map((mode) => (
        <button
          key={mode.value}
          type="button"
          role="radio"
          aria-checked={viewMode === mode.value}
          onClick={() => changeViewMode(mode.value)}
          className={cn(
            "min-h-7 cursor-pointer rounded-control-inner px-2.5 text-xs font-bold transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11",
            viewMode === mode.value ? "bg-primary/10 text-primary-text" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {mode.label}
        </button>
      ))}
    </div>
  ) : translationPending ? (
    <span role="status" className="text-xs text-muted-foreground">
      한국어 번역을 준비하고 있어요
    </span>
  ) : null;

  return (
    <LyricsFrame controls={viewToggle}>
      <div
        ref={containerRef}
        tabIndex={0}
        aria-label="가사 목록"
        className="relative h-60 overflow-y-auto rounded-control-inner bg-surface-1 px-4 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-72"
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
              const translated = translatedLine(translationLines, line.text);
              const originalVisible = showOriginal || !translated;
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
                  {originalVisible && line.text}
                  {translated && showTranslation && (
                    <span className={cn("block", originalVisible && "mt-0.5 text-sm font-medium", active && originalVisible && "text-foreground/80")}>
                      {translated}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="space-y-2 break-words text-center text-sm leading-relaxed text-foreground">
            {lyrics.plainText.split(/\r?\n/).map((text, index) => {
              if (!text.trim()) return <div key={index} aria-hidden className="h-3" />;
              const translated = translatedLine(translationLines, text);
              const originalVisible = showOriginal || !translated;
              return (
                <p key={index}>
                  {originalVisible && text}
                  {translated && showTranslation && (
                    <span className={cn("block", originalVisible && "text-xs text-muted-foreground")}>{translated}</span>
                  )}
                </p>
              );
            })}
          </div>
        )}
      </div>
    </LyricsFrame>
  );
}
