"use client";

import { useEffect, useRef } from "react";

import { presetGradient } from "./greeting-draw";

/** 프리셋 그라디언트 스와치 — 서버 렌더러와 같은 그라디언트를 작은 캔버스로 그려요 */
export function PresetSwatch({ id }: { id: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const gradient = presetGradient(id);
    ctx.fillStyle = gradient.base;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const g = ctx.createLinearGradient(0, canvas.height, canvas.width, 0);
    g.addColorStop(0, gradient.from);
    g.addColorStop(1, gradient.to);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, [id]);
  return (
    <canvas
      ref={ref}
      width={64}
      height={40}
      className="block h-10 w-16 rounded-sm"
      aria-hidden
    />
  );
}
