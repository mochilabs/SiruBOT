import { useCallback, useRef } from "react";
import {
  GreetingLayer,
} from "@sirubot/utils/memberGreeting";

import { CARD_H, CARD_W, clampRatio, hitTestLayer, layerBounds } from "./greeting-draw";

interface DragState {
  layerId: string;
  pointerId: number;
  mode: "move" | "resize";
  start: { x: number; y: number };
  initial: GreetingLayer;
  bounds: { x: number; y: number; w: number; h: number };
  signX: -1 | 1;
  signY: -1 | 1;
}

export interface GreetingDrag {
  handlePointerDown: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  handlePointerMove: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  endDrag: (event: React.PointerEvent<HTMLCanvasElement>) => void;
}

/**
 * 캔버스 드래그 이동·리사이즈 — pointer capture + rAF 스로틀로 패치하고,
 * 놓는 순간 commit()으로 히스토리 한 단계로 묶어요.
 */
export function useGreetingDrag({
  canvasRef,
  saving,
  layers,
  selectedId,
  setSelectedId,
  patchLayer,
  commit,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  saving: boolean;
  layers: GreetingLayer[];
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  patchLayer: (layerId: string, partial: Partial<GreetingLayer>) => void;
  commit: () => void;
}): GreetingDrag {
  const dragRef = useRef<DragState | null>(null);
  const dragPointRef = useRef<{ x: number; y: number } | null>(null);
  const dragFrameRef = useRef<number | null>(null);

  const canvasPoint = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((clientX - rect.left) / rect.width) * CARD_W,
        y: ((clientY - rect.top) / rect.height) * CARD_H,
      };
    },
    [canvasRef],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (saving) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const point = canvasPoint(event.clientX, event.clientY);
    if (!point) return;
    const { x: px, y: py } = point;
    const selectedLayer = selectedId
      ? layers.find((layer) => layer.id === selectedId && !layer.hidden)
      : null;
    if (selectedLayer) {
      const bounds = layerBounds(ctx, selectedLayer);
      const rect = canvas.getBoundingClientRect();
      const hitSize = Math.max(24, (22 * CARD_W) / rect.width);
      const corners = [
        { x: bounds.x, y: bounds.y, signX: -1 as const, signY: -1 as const },
        {
          x: bounds.x + bounds.w,
          y: bounds.y,
          signX: 1 as const,
          signY: -1 as const,
        },
        {
          x: bounds.x,
          y: bounds.y + bounds.h,
          signX: -1 as const,
          signY: 1 as const,
        },
        {
          x: bounds.x + bounds.w,
          y: bounds.y + bounds.h,
          signX: 1 as const,
          signY: 1 as const,
        },
      ];
      const handle = corners.find(
        (corner) =>
          Math.abs(px - corner.x) <= hitSize &&
          Math.abs(py - corner.y) <= hitSize,
      );
      if (handle) {
        setSelectedId(selectedLayer.id);
        dragRef.current = {
          layerId: selectedLayer.id,
          pointerId: event.pointerId,
          mode: "resize",
          start: point,
          initial: selectedLayer,
          bounds,
          signX: handle.signX,
          signY: handle.signY,
        };
        canvas.setPointerCapture(event.pointerId);
        return;
      }
    }
    const visible = layers.filter((layer) => !layer.hidden);
    const hit = hitTestLayer(ctx, visible, px, py);
    if (hit) {
      setSelectedId(hit.id);
      dragRef.current = {
        layerId: hit.id,
        pointerId: event.pointerId,
        mode: "move",
        start: point,
        initial: hit,
        bounds: layerBounds(ctx, hit),
        signX: 1,
        signY: 1,
      };
      canvas.setPointerCapture(event.pointerId);
    } else {
      setSelectedId(null);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = canvasPoint(event.clientX, event.clientY);
    if (!point) return;
    dragPointRef.current = point;
    if (dragFrameRef.current == null) {
      dragFrameRef.current = requestAnimationFrame(() => {
        dragFrameRef.current = null;
        const next = dragPointRef.current;
        if (!next) return;
        const dx = next.x - drag.start.x;
        const dy = next.y - drag.start.y;
        if (drag.mode === "move") {
          patchLayer(drag.layerId, {
            x: clampRatio(drag.initial.x + (dx / CARD_W) * 100),
            y: clampRatio(drag.initial.y + (dy / CARD_H) * 100),
          });
          return;
        }
        const widthDelta = dx * drag.signX;
        const heightDelta = dy * drag.signY;
        const centerX =
          (drag.initial.x / 100) * CARD_W + (widthDelta / 2) * drag.signX;
        const centerY =
          (drag.initial.y / 100) * CARD_H + (heightDelta / 2) * drag.signY;
        const position = {
          x: clampRatio((centerX / CARD_W) * 100),
          y: clampRatio((centerY / CARD_H) * 100),
        };
        if (drag.initial.type === "text") {
          const scale = Math.max(
            0.2,
            Math.min(
              (drag.bounds.w + widthDelta) / drag.bounds.w,
              (drag.bounds.h + heightDelta) / drag.bounds.h,
            ),
          );
          patchLayer(drag.layerId, {
            ...position,
            size: Math.round(
              Math.max(12, Math.min(160, drag.initial.size * scale)),
            ),
          });
        } else if (drag.initial.type === "avatar") {
          const size = Math.round(
            Math.max(
              40,
              Math.min(
                600,
                drag.initial.size + Math.max(widthDelta, heightDelta),
              ),
            ),
          );
          patchLayer(drag.layerId, { ...position, size });
        } else {
          patchLayer(drag.layerId, {
            ...position,
            width: Math.round(
              Math.max(1, Math.min(CARD_W, drag.initial.width + widthDelta)),
            ),
            height: Math.round(
              Math.max(1, Math.min(CARD_H, drag.initial.height + heightDelta)),
            ),
          });
        }
      });
    }
  };

  const endDrag = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    dragPointRef.current = null;
    if (dragFrameRef.current != null) {
      cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
    canvasRef.current?.releasePointerCapture(event.pointerId);
    // 드래그 중 rAF 패치는 히스토리에 안 쌓이고, 놓는 순간 한 단계로 커밋돼요
    commit();
  };

  return { handlePointerDown, handlePointerMove, endDrag };
}
