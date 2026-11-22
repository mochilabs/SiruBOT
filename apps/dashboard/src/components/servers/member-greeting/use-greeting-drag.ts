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

/** 이만큼(카드 px) 움직이기 전에는 클릭으로 봐요 — 다중 선택에서 클릭하면 그 레이어만 남기는 동작에 써요 */
const CLICK_SLOP = 3;
/** 스냅이 붙는 거리 — 화면 기준 px (카드 px로 환산해서 써요) */
const SNAP_SCREEN_PX = 8;

type DragState =
  | {
      kind: "move";
      pointerId: number;
      start: { x: number; y: number };
      /** 함께 움직이는 레이어와 시작 위치 */
      initials: { id: string; x: number; y: number }[];
      /** 시작 시점의 선택 전체 박스 */
      bounds: Box;
      /** 스냅 대상 — 움직이지 않는 보이는 레이어 박스 */
      others: Box[];
      moved: boolean;
      /** 움직이지 않고 놓으면 이 레이어만 남겨요 (이미 다중 선택된 레이어를 클릭한 경우) */
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
      /** Shift로 시작했으면 기존 선택에 더해요 */
      base: string[];
    };

export interface GreetingDrag {
  handlePointerDown: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  handlePointerMove: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  endDrag: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  /** 드래그 중인지 — 미리보기 SVG는 드래그 중 재렌더하지 않고 놓을 때 이어서 그려요 */
  dragging: boolean;
}

/**
 * 캔버스 드래그 — 이동(여러 레이어 포함, 스냅 가이드)·리사이즈(단일)·마퀴 선택이에요.
 * pointer capture + rAF 스로틀로 패치하고, 놓는 순간 commit()으로 히스토리 한 단계로 묶어요.
 * Shift/Ctrl/Cmd 클릭은 선택 토글, Alt를 누르고 있으면 스냅을 잠시 꺼요.
 */
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
  /** 여러 레이어를 한 번에 패치해요 (한 번의 이미지 갱신) */
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

    // 크기 조절 핸들은 레이어 하나만 선택했을 때만 나와요
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
      // 빈 곳 — 마퀴 선택 시작 (Shift가 아니면 기존 선택은 비워요)
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
        // 선택에서 빼기 — 드래그는 시작하지 않아요
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

  /** rAF 한 프레임 분량의 드래그 반영 */
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
    // resize (단일 레이어)
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
    // 마지막 포인터 위치까지 반영하고 끝내요 (rAF가 아직 안 돈 경우)
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
    // 드래그 중 rAF 패치는 히스토리에 안 쌓이고, 놓는 순간 한 단계로 커밋돼요
    commit();
  };

  return { handlePointerDown, handlePointerMove, endDrag, dragging };
}
