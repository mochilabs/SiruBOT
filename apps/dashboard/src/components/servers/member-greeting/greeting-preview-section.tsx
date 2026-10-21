"use client";

import { Redo2, Undo2 } from "lucide-react";

import { SectionLabel } from "@/components/primitives/section-label";
import { Button } from "@/components/ui/button";

import { CARD_H, CARD_W } from "./greeting-draw";

interface GreetingPreviewSectionProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  saving: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onPointerDown: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  /** 포인터 놓기·취소 둘 다 같은 정리(드래그 종료 + 커밋)를 해요 */
  onPointerEnd: (event: React.PointerEvent<HTMLCanvasElement>) => void;
}

/** 미리보기 — 실행취소/다시실행 버튼과 드래그로 조작하는 카드 캔버스 */
export function GreetingPreviewSection({
  canvasRef,
  saving,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onPointerDown,
  onPointerMove,
  onPointerEnd,
}: GreetingPreviewSectionProps) {
  return (
    <div className="min-w-0 lg:col-start-1 lg:row-start-1">
      <div className="flex items-center justify-between gap-2 pb-1">
        <SectionLabel as="p">미리보기</SectionLabel>
        <div className="flex items-center gap-1">
          <Button
            variant="icon"
            size="sm"
            icon={<Undo2 size={14} />}
            aria-label="실행취소"
            title="실행취소 (Ctrl+Z)"
            disabled={saving || !canUndo}
            onClick={onUndo}
          />
          <Button
            variant="icon"
            size="sm"
            icon={<Redo2 size={14} />}
            aria-label="다시실행"
            title="다시실행 (Ctrl+Shift+Z)"
            disabled={saving || !canRedo}
            onClick={onRedo}
          />
        </div>
      </div>
      <canvas
        ref={canvasRef}
        width={CARD_W}
        height={CARD_H}
        className="mx-auto block w-full cursor-crosshair touch-none rounded-card bg-muted lg:max-w-[74.667dvh]"
        style={{ aspectRatio: "1200 / 675" }}
        role="img"
        aria-label="인사 카드 미리보기, 레이어를 클릭해 선택하고 드래그로 옮겨요"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      />
    </div>
  );
}
