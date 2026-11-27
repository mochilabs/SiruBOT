import { useCallback, useEffect, useRef, useState } from "react";
import { greetingAnimationDurationMs, type GreetingImage,hasGreetingAnimation } from "@sirubot/utils/memberGreeting";

import { renderGreetingPreviewUrl } from "./greeting-svg";

export const GREETING_RENDER_DEBOUNCE_MS = 150;
const SLOW_FRAME_MS = 250;
const SLOW_FRAME_LIMIT = 3;
const PLAYBACK_SCALE = 0.5;

interface UseGreetingSvgOptions {
  active: boolean;
  image: GreetingImage;
  avatarSrc: string | null;
  guildName: string;
  paused: boolean;
}

export interface GreetingSvgResult {
  src: string | null;
  error: boolean;
  animated: boolean;
  durationMs: number;
  playing: boolean;
  timeMs: number;
  autoPaused: boolean;
  setPlaying: (playing: boolean) => void;
  seek: (timeMs: number) => void;
}

export function useGreetingSvg({ active, image, avatarSrc, guildName, paused }: UseGreetingSvgOptions): GreetingSvgResult {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [playing, setPlayingState] = useState(false);
  const [timeMs, setTimeMs] = useState(0);
  const [autoPaused, setAutoPaused] = useState(false);
  const renderedOnceRef = useRef(false);

  const animated = hasGreetingAnimation(image);
  const durationMs = animated ? greetingAnimationDurationMs(image) : 0;

  useEffect(() => {
    if (animated) return;
    setPlayingState(false);
    setTimeMs(0);
  }, [animated]);

  useEffect(() => {
    if (!active || paused || playing) return;
    let cancelled = false;
    const delay = renderedOnceRef.current ? GREETING_RENDER_DEBOUNCE_MS : 0;
    const timer = window.setTimeout(() => {
      renderGreetingPreviewUrl(image, { avatarSrc, guildName, timeMs })
        .then((dataUrl) => {
          if (cancelled) return;
          renderedOnceRef.current = true;
          setSrc(dataUrl);
          setError(false);
        })
        .catch(() => {
          if (!cancelled) setError(true);
        });
    }, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [active, paused, playing, image, avatarSrc, guildName, timeMs]);

  useEffect(() => {
    if (!active || paused || !playing || durationMs <= 0) return;
    let stopped = false;
    let slow = 0;
    const origin = performance.now() - timeMs;
    const loop = async () => {
      while (!stopped) {
        const frameStart = performance.now();
        const t = (frameStart - origin) % durationMs;
        try {
          const dataUrl = await renderGreetingPreviewUrl(image, { avatarSrc, guildName, timeMs: t, scale: PLAYBACK_SCALE });
          if (stopped) return;
          renderedOnceRef.current = true;
          setSrc(dataUrl);
          setTimeMs(t);
          setError(false);
        } catch {
          if (!stopped) {
            setError(true);
            setPlayingState(false);
          }
          return;
        }
        slow = performance.now() - frameStart > SLOW_FRAME_MS ? slow + 1 : 0;
        if (slow >= SLOW_FRAME_LIMIT) {
          setAutoPaused(true);
          setPlayingState(false);
          return;
        }
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
    };
    void loop();
    return () => {
      stopped = true;
    };
    // timeMs는 시작 위치로만 쓰고 의존성에는 넣지 않아요 — 프레임마다 바뀌면 루프가 계속 다시 시작돼요
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, paused, playing, durationMs, image, avatarSrc, guildName]);

  const setPlaying = useCallback((next: boolean) => {
    setAutoPaused(false);
    setPlayingState(next);
  }, []);

  const seek = useCallback((next: number) => {
    setPlayingState(false);
    setTimeMs(next);
  }, []);

  return { src, error, animated, durationMs, playing, timeMs, autoPaused, setPlaying, seek };
}
