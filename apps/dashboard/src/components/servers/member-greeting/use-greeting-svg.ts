import { useEffect, useRef, useState } from "react";
import type { GreetingImage } from "@sirubot/utils/memberGreeting";

import { renderGreetingPreviewUrl } from "./greeting-svg";

/** 입력(타이핑·슬라이더)이 멈춘 뒤 이만큼 기다렸다가 다시 그려요 */
export const GREETING_RENDER_DEBOUNCE_MS = 150;

interface UseGreetingSvgOptions {
  /** 탭이 보일 때만 그려요 — 탭 셸이 패널을 마운트 유지하기 때문이에요 */
  active: boolean;
  image: GreetingImage;
  avatarSrc: string | null;
  guildName: string;
  /** true인 동안(드래그 중)은 재렌더하지 않고 마지막 결과를 그대로 보여줘요. 놓으면 바로 이어서 그려요 */
  paused: boolean;
}

/**
 * satori로 만든 인사 카드 SVG를 `<img src>`용 data URI로 돌려줘요.
 * 첫 렌더는 바로, 이후 변경은 150ms 디바운스 뒤에 그려요. 그리는 동안 이전 결과를 유지해서 깜빡이지 않아요.
 * 실패하면 error가 true가 되고 마지막 성공 결과를 유지해요.
 */
export function useGreetingSvg({
  active,
  image,
  avatarSrc,
  guildName,
  paused,
}: UseGreetingSvgOptions): { src: string | null; error: boolean } {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const renderedOnceRef = useRef(false);

  useEffect(() => {
    if (!active || paused) return;
    let cancelled = false;
    const delay = renderedOnceRef.current ? GREETING_RENDER_DEBOUNCE_MS : 0;
    const timer = window.setTimeout(() => {
      renderGreetingPreviewUrl(image, { avatarSrc, guildName })
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
  }, [active, paused, image, avatarSrc, guildName]);

  return { src, error };
}
