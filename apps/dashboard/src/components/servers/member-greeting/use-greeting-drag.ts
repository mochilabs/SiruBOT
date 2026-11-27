import { useCallback, useRef, useState } from "react";
import { GreetingLayer } from "@sirubot/utils/memberGreeting";

import {
  CARD_H,
  CARD_W,
  clampRatio,
  type GreetingOverlay,
  hitTestLayer,
  layerBounds,
} from "./greeting-draw";
import { type Box, boxesIntersect, boxFromPoints, snapBox, unionBox } from "./greeting-snap";

const CLICK_SLOP = 3;
const SNAP_SCREEN_PX = 8;

type DragState =
  | {
      kind: "move";
      pointerId: number;
      start: { x: number; y: number };
      initials: { id: string; x: number; y: number }[];
      bounds: Box;
      others: Box[];
      moved: boolean;
      collapseTo: string | null;
    }
  | {
      kind: "resize";
      pointerId: number;
      layerId: string;
      start: { x: number; y: number };
      initial: GreetingLayer;
      bounds: Box;
      signX: -1 | 1;
      signY: -1 | 1;
    }
  | {
      kind: "marquee";
      pointerId: number;
      start: { x: number; y: number };
      base: string[];
    };

export interface GreetingDrag {
  handlePointerDown: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  handlePointerMove: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  endDrag: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  dragging: boolean;
}

export function useGreetingDrag({
  canvasRef,
  saving,
  layers,
  selectedIds,
  setSelectedIds,
  patchLayers,
  commit,
  snapEnabled,
  setOverlay,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  saving: boolean;
  layers: GreetingLayer[];
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  patchLayers: (partials: Record<string, Partial<GreetingLayer>>) => void;
  commit: () => void;
  snapEnabled: boolean;
  setOverlay: (overlay: GreetingOverlay) => void;
}): GreetingDrag {
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const dragPointRef = useRef<{ x: number; y: number; alt: boolean } | null>(null);
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
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;

    const selectedLayer =
      selectedIds.length === 1 && !additive
        ? layers.find((layer) => layer.id === selectedIds[0] && !layer.hidden)
        : null;
    if (selectedLayer) {
      const bounds = layerBounds(ctx, selectedLayer);
      const rect = canvas.getBoundingClientRect();
      const hitSize = Math.max(24, (22 * CARD_W) / rect.width);
      const corners = [
        { x: bounds.x, y: bounds.y, signX: -1 as const, signY: -1 as const },
        { x: bounds.x + bounds.w, y: bounds.y, signX: 1 as const, signY: -1 as const },
        { x: bounds.x, y: bounds.y + bounds.h, signX: -1 as const, signY: 1 as const },
        { x: bounds.x + bounds.w, y: bounds.y + bounds.h, signX: 1 as const, signY: 1 as const },
      ];
      const handle = corners.find(
        (corner) => Math.abs(px - corner.x) <= hitSize && Math.abs(py - corner.y) <= hitSize,
      );
      if (handle) {
        dragRef.current = {
          kind: "resize",
          pointerId: event.pointerId,
          layerId: selectedLayer.id,
          start: point,
          initial: selectedLayer,
          bounds,
          signX: handle.signX,
          signY: handle.signY,
        };
        canvas.setPointerCapture(event.pointerId);
        setDragging(true);
        return;
      }
    }

    const visible = layers.filter((layer) => !layer.hidden);
    const hit = hitTestLayer(ctx, visible, px, py);
    if (!hit) {
      const base = additive ? selectedIds : [];
      if (!additive) setSelectedIds([]);
      dragRef.current = { kind: "marquee", pointerId: event.pointerId, start: point, base };
      canvas.setPointerCapture(event.pointerId);
      setDragging(true);
      return;
    }

    let moving: string[];
    let collapseTo: string | null = null;
    if (additive) {
      if (selectedIds.includes(hit.id)) {
        setSelectedIds(selectedIds.filter((id) => id !== hit.id));
        return;
      }
      moving = [...selectedIds, hit.id];
      setSelectedIds(moving);
    } else if (selectedIds.includes(hit.id)) {
      moving = selectedIds;
      if (selectedIds.length > 1) collapseTo = hit.id;
    } else {
      moving = [hit.id];
      setSelectedIds(moving);
    }
    const movingLayers = visible.filter((layer) => moving.includes(layer.id));
    const bounds = unionBox(movingLayers.map((layer) => layerBounds(ctx, layer)));
    if (!bounds) return;
    dragRef.current = {
      kind: "move",
      pointerId: event.pointerId,
      start: point,
      initials: movingLayers.map((layer) => ({ id: layer.id, x: layer.x, y: layer.y })),
      bounds,
      others: visible.filter((layer) => !moving.includes(layer.id)).map((layer) => layerBounds(ctx, layer)),
      moved: false,
      collapseTo,
    };
    canvas.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const applyDrag = (drag: DragState, next: { x: number; y: number; alt: boolean }) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (drag.kind === "marquee") {
      const marquee = boxFromPoints(drag.start, next);
      setOverlay({ marquee });
      if (!ctx) return;
      const hits = layers
        .filter((layer) => !layer.hidden && boxesIntersect(marquee, layerBounds(ctx, layer)))
        .map((layer) => layer.id);
      setSelectedIds([...new Set([...drag.base, ...hits])]);
      return;
    }
    const dx0 = next.x - drag.start.x;
    const dy0 = next.y - drag.start.y;
    if (drag.kind === "move") {
      if (!drag.moved && Math.hypot(dx0, dy0) < CLICK_SLOP) return;
      drag.moved = true;
      let dx = dx0;
      let dy = dy0;
      let guides: GreetingOverlay["guides"] = [];
      if (snapEnabled && !next.alt && canvas) {
        const threshold = (SNAP_SCREEN_PX * CARD_W) / canvas.getBoundingClientRect().width;
        const moved: Box = { ...drag.bounds, x: drag.bounds.x + dx0, y: drag.bounds.y + dy0 };
        const snap = snapBox(moved, drag.others, { w: CARD_W, h: CARD_H }, threshold);
        dx += snap.dx;
        dy += snap.dy;
        guides = snap.guides;
      }
      setOverlay({ guides });
      const partials: Record<string, Partial<GreetingLayer>> = {};
      for (const initial of drag.initials) {
        partials[initial.id] = {
          x: clampRatio(initial.x + (dx / CARD_W) * 100),
          y: clampRatio(initial.y + (dy / CARD_H) * 100),
        };
      }
      patchLayers(partials);
      return;
    }
    const widthDelta = dx0 * drag.signX;
    const heightDelta = dy0 * drag.signY;
    const centerX = (drag.initial.x / 100) * CARD_W + (widthDelta / 2) * drag.signX;
    const centerY = (drag.initial.y / 100) * CARD_H + (heightDelta / 2) * drag.signY;
    const position = {
      x: clampRatio((centerX / CARD_W) * 100),
      y: clampRatio((centerY / CARD_H) * 100),
    };
    let partial: Partial<GreetingLayer>;
    if (drag.initial.type === "text") {
      const scale = Math.max(
        0.2,
        Math.min(
          (drag.bounds.w + widthDelta) / drag.bounds.w,
          (drag.bounds.h + heightDelta) / drag.bounds.h,
        ),
      );
      partial = {
        ...position,
        size: Math.round(Math.max(12, Math.min(160, drag.initial.size * scale))),
      };
    } else if (drag.initial.type === "avatar") {
      const size = Math.round(
        Math.max(40, Math.min(600, drag.initial.size + Math.max(widthDelta, heightDelta))),
      );
      partial = { ...position, size };
    } else {
      partial = {
        ...position,
        width: Math.round(Math.max(1, Math.min(CARD_W, drag.initial.width + widthDelta))),
        height: Math.round(Math.max(1, Math.min(CARD_H, drag.initial.height + heightDelta))),
      };
    }
    patchLayers({ [drag.layerId]: partial });
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = canvasPoint(event.clientX, event.clientY);
    if (!point) return;
    dragPointRef.current = { ...point, alt: event.altKey };
    if (dragFrameRef.current == null) {
      dragFrameRef.current = requestAnimationFrame(() => {
        dragFrameRef.current = null;
        const next = dragPointRef.current;
        const current = dragRef.current;
        if (!next || !current) return;
        applyDrag(current, next);
      });
    }
  };

  const endDrag = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (dragFrameRef.current != null) {
      cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
      if (dragPointRef.current) applyDrag(drag, dragPointRef.current);
    }
    dragRef.current = null;
    dragPointRef.current = null;
    setDragging(false);
    setOverlay({});
    if (drag.kind === "move" && !drag.moved && drag.collapseTo) {
      setSelectedIds([drag.collapseTo]);
    }
    canvasRef.current?.releasePointerCapture(event.pointerId);
    commit();
  };

  return { handlePointerDown, handlePointerMove, endDrag, dragging };
}
