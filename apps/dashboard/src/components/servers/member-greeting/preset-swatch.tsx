"use client";

import { useEffect, useRef } from "react";
import { greetingPresetBackgroundPlan } from "@sirubot/utils/greetingCardDesign";

/** 프리셋 그라디언트 스와치 — 서버 렌더러와 같은 그라디언트 데이터(공용 계약)를 작은 캔버스로 그려요 */
export function PresetSwatch({ id }: { id: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const plan = greetingPresetBackgroundPlan(canvas.width, canvas.height, id);
    ctx.fillStyle = plan.base;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const gradient = ctx.createLinearGradient(plan.linear.x0, plan.linear.y0, plan.linear.x1, plan.linear.y1);
    for (const [offset, color] of plan.linear.stops) {
      gradient.addColorStop(offset, color);
    }
    ctx.fillStyle = gradient;
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
