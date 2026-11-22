import { useCallback, useEffect, useRef, useState } from "react";
import { greetingAnimationDurationMs, type GreetingImage,hasGreetingAnimation } from "@sirubot/utils/memberGreeting";

import { renderGreetingPreviewUrl } from "./greeting-svg";

/** 입력(타이핑·슬라이더)이 멈춘 뒤 이만큼 기다렸다가 다시 그려요 */
export const GREETING_RENDER_DEBOUNCE_MS = 150;
/** 재생 중 한 프레임을 그리는 데 이 시간보다 오래 걸리는 일이 연속으로 이만큼 나오면 자동으로 멈춰요 */
const SLOW_FRAME_MS = 250;
const SLOW_FRAME_LIMIT = 3;
/** 재생 중 프레임은 절반 크기로 그려요 — 멈추면 전체 크기로 다시 그려요 */
const PLAYBACK_SCALE = 0.5;

interface UseGreetingSvgOptions {
  /** 탭이 보일 때만 그려요 — 탭 셸이 패널을 마운트 유지하기 때문이에요 */
  active: boolean;
  image: GreetingImage;
  avatarSrc: string | null;
  guildName: string;
  /** true인 동안(드래그 중)은 재렌더하지 않고 마지막 결과를 그대로 보여줘요. 놓으면 바로 이어서 그려요 */
  paused: boolean;
}

export interface GreetingSvgResult {
  src: string | null;
  error: boolean;
  /** 보이는 레이어 중 움직임이 있는 게 하나라도 있는지 */
  animated: boolean;
  /** 카드 한 바퀴 길이(ms) — 움직임이 없으면 0 */
  durationMs: number;
  playing: boolean;
  /** 재생 위치(ms, 0 ~ durationMs) */
  timeMs: number;
  /** 재생이 느려서 자동으로 멈췄는지 — 안내 문구용이에요 */
  autoPaused: boolean;
  setPlaying: (playing: boolean) => void;
  /** 타임라인을 직접 옮겨요 (재생 중이면 멈추고 그 시점의 프레임을 그려요) */
  seek: (timeMs: number) => void;
}

/**
 * Takumi WASM으로 만든 인사 카드를 `<img src>`용 data URL로 돌려줘요.
 * 정지 상태: 첫 렌더는 바로, 이후 변경은 150ms 디바운스 뒤에 그려요. 그리는 동안 이전 결과를 유지해서 깜빡이지 않아요.
 * 재생 상태(움직임이 있을 때): 한 프레임을 다 그리면 현재 시각의 다음 프레임을 바로 그려요 — 느리면 프레임을 건너뛰고,
 * 계속 느리면(250ms 초과 3회) 자동으로 멈춰요. 실패하면 error가 true가 되고 마지막 성공 결과를 유지해요.
 */
export function useGreetingSvg({ active, image, avatarSrc, guildName, paused }: UseGreetingSvgOptions): GreetingSvgResult {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [playing, setPlayingState] = useState(false);
  const [timeMs, setTimeMs] = useState(0);
  const [autoPaused, setAutoPaused] = useState(false);
  const renderedOnceRef = useRef(false);

  const animated = hasGreetingAnimation(image);
  const durationMs = animated ? greetingAnimationDurationMs(image) : 0;

  // 움직임이 사라지면(레이어 삭제·되돌리기) 재생을 끝내고 처음으로 돌아가요
  useEffect(() => {
    if (animated) return;
    setPlayingState(false);
    setTimeMs(0);
  }, [animated]);

  // 정지 상태 렌더 — 재생 중에는 아래 재생 루프가 그려요
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

  // 재생 루프 — 렌더가 끝날 때마다 실제 흐른 시간으로 다음 프레임 시각을 정해요 (느리면 프레임이 건너뛰어져요)
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
        // 브라우저가 한 틱 숨 쉴 틈을 줘요 (입력·페인트가 밀리지 않게)
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
