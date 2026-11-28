"use client";

import { useEffect, useState } from "react";

const SAMPLE_SIZE = 16;
/** 이 값보다 채도가 낮은(회색에 가까운) 픽셀은 평균에서 빼요 */
const MIN_SATURATION = 0.2;
/** 유효 픽셀이 이 비율보다 적으면 앨범이 무채색이라고 보고 틴트를 쓰지 않아요 */
const MIN_COLORFUL_RATIO = 0.08;

const cache = new Map<string, string | null>();

function extractColor(img: HTMLImageElement): string | null {
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  // CORS를 허용하지 않는 CDN이면 여기서 SecurityError가 나요
  const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

  let r = 0;
  let g = 0;
  let b = 0;
  let weight = 0;
  for (let i = 0; i < data.length; i += 4) {
    const pr = data[i]!;
    const pg = data[i + 1]!;
    const pb = data[i + 2]!;
    const max = Math.max(pr, pg, pb);
    const min = Math.min(pr, pg, pb);
    if (max < 40 || min > 225) continue; // 거의 검정·흰색은 건너뛰어요
    const sat = (max - min) / max;
    if (sat < MIN_SATURATION) continue;
    r += pr * sat;
    g += pg * sat;
    b += pb * sat;
    weight += sat;
  }
  if (weight === 0 || weight / (SAMPLE_SIZE * SAMPLE_SIZE) < MIN_COLORFUL_RATIO) return null;
  return `${Math.round(r / weight)} ${Math.round(g / weight)} ${Math.round(b / weight)}`;
}

/**
 * 앨범 아트의 대표 색을 "r g b" 문자열로 돌려줘요.
 * 이미지가 CORS를 막거나 무채색이면 null이라 호출하는 쪽은 틴트 없이 그대로 그려요.
 */
export function useArtworkColor(url: string | null): string | null {
  const [state, setState] = useState<{ url: string | null; color: string | null }>({
    url: null,
    color: null,
  });

  useEffect(() => {
    if (!url) return;
    if (cache.has(url)) {
      setState({ url, color: cache.get(url) ?? null });
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      let color: string | null = null;
      try {
        color = extractColor(img);
      } catch {
        color = null;
      }
      cache.set(url, color);
      if (!cancelled) setState({ url, color });
    };
    img.onerror = () => {
      cache.set(url, null);
      if (!cancelled) setState({ url, color: null });
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);

  // 곡이 바뀐 직후 이전 곡 색이 잠깐 남지 않게 url이 맞을 때만 써요
  return url && state.url === url ? state.color : null;
}
