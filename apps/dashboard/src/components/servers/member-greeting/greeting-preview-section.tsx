"use client";

import { Redo2, Undo2 } from "lucide-react";

import { SectionLabel } from "@/components/primitives/section-label";
import { Button } from "@/components/ui/button";

import { CARD_H, CARD_W } from "./greeting-draw";

interface GreetingPreviewSectionProps {
  /** 선택 테두리·핸들과 포인터 조작을 받는 투명 canvas — 카드 본체는 아래 SVG 이미지예요 */
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** satori로 그린 카드 SVG(data URI) — 첫 렌더 전에는 null */
  previewSrc: string | null;
  previewError: boolean;
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
  previewSrc,
  previewError,
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
      <div
        className="relative mx-auto w-full overflow-hidden rounded-card bg-muted lg:max-w-[74.667dvh]"
        style={{ aspectRatio: "1200 / 675" }}
      >
        {previewSrc && (
          // satori가 만든 SVG data URI라 next/image 최적화 대상이 아니에요
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewSrc}
            alt=""
            draggable={false}
            className="pointer-events-none absolute inset-0 size-full select-none"
          />
        )}
        {!previewSrc && (
          <p className="absolute inset-0 grid place-items-center text-sm font-medium text-muted-foreground/80">
            {previewError ? "미리보기를 그리지 못했어요" : "미리보기를 그리는 중이에요"}
          </p>
        )}
        <canvas
          ref={canvasRef}
          width={CARD_W}
          height={CARD_H}
          className="absolute inset-0 size-full cursor-crosshair touch-none"
          role="img"
          aria-label="인사 카드 미리보기, 레이어를 클릭해 선택하고 드래그로 옮겨요"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        />
      </div>
      {previewError && previewSrc && (
        <p className="pt-1 text-2xs text-muted-foreground/80">
          최근 변경을 미리보기에 반영하지 못했어요. 저장된 카드는 서버가 그려요.
        </p>
      )}
    </div>
  );
}
