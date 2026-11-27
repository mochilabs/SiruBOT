"use client";

import { useEffect, useRef } from "react";
import { greetingPresetBackgroundPlan } from "@sirubot/utils/greetingCardDesign";

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
