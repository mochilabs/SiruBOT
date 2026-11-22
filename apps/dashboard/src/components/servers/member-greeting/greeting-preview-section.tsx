"use client";

import { Pause, Play, Redo2, Undo2 } from "lucide-react";

import { SectionLabel } from "@/components/primitives/section-label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

import { CARD_H, CARD_W } from "./greeting-draw";

interface GreetingPreviewSectionProps {
  /** 선택 테두리·핸들과 포인터 조작을 받는 투명 canvas — 카드 본체는 아래 SVG 이미지예요 */
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** satori로 그린 카드 SVG(data URI) — 첫 렌더 전에는 null */
  previewSrc: string | null;
  previewError: boolean;
  /** 움직이는 레이어가 있을 때만 재생 컨트롤을 보여줘요 */
  animated: boolean;
  playing: boolean;
  /** 재생이 느려서 자동으로 멈췄을 때 안내 문구를 보여줘요 */
  autoPaused: boolean;
  timeMs: number;
  durationMs: number;
  onTogglePlay: () => void;
  onSeek: (timeMs: number) => void;
  saving: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onPointerDown: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  /** 포인터 놓기·취소 둘 다 같은 정리(드래그 종료 + 커밋)를 해요 */
  onPointerEnd: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  /** 드래그 중 가이드선에 붙이는 스냅 — Alt를 누르고 있으면 잠시 꺼져요 */
  snapEnabled: boolean;
  onToggleSnap: () => void;
}

/** 미리보기 — 실행취소/다시실행 버튼과 드래그로 조작하는 카드 캔버스 */
export function GreetingPreviewSection({
  canvasRef,
  previewSrc,
  previewError,
  animated,
  playing,
  autoPaused,
  timeMs,
  durationMs,
  onTogglePlay,
  onSeek,
  saving,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onPointerDown,
  onPointerMove,
  onPointerEnd,
  snapEnabled,
  onToggleSnap,
}: GreetingPreviewSectionProps) {
  return (
    <div className="min-w-0 lg:col-start-1 lg:row-start-1">
      <div className="flex items-center justify-between gap-2 pb-1">
        <SectionLabel as="p">미리보기</SectionLabel>
        <div className="flex items-center gap-1">
          <Button
            variant="state-toggle"
            size="sm"
            active={snapEnabled}
            aria-pressed={snapEnabled}
            title="가이드선에 붙이기 (드래그 중 Alt를 누르면 잠시 꺼져요)"
            onClick={onToggleSnap}
            disabled={saving}
          >
            스냅
          </Button>
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
      <p className="pt-1 text-2xs text-muted-foreground/80">
        Shift 클릭·빈 곳 드래그로 여러 개 선택, Ctrl+C/V 복사·붙여넣기, Ctrl+D 복제, 방향키로 미세 이동(Shift는 10배)해요.
      </p>
      {animated && (
        <div className="flex items-center gap-3 pt-2">
          <Button
            variant="icon"
            size="sm"
            icon={playing ? <Pause size={14} /> : <Play size={14} />}
            aria-label={playing ? "미리보기 일시정지" : "미리보기 재생"}
            title={playing ? "일시정지" : "재생"}
            disabled={saving}
            onClick={onTogglePlay}
          />
          <Slider
            className="flex-1"
            value={Math.min(timeMs, durationMs)}
            min={0}
            max={durationMs}
            step={50}
            label="재생 위치"
            hideLabel
            showValue
            formatValue={(value) => `${(value / 1000).toFixed(1)}초 / ${(durationMs / 1000).toFixed(1)}초`}
            disabled={saving}
            onChange={onSeek}
          />
        </div>
      )}
      {animated && autoPaused && (
        <p className="pt-1 text-2xs text-muted-foreground/80">
          미리보기가 느려서 재생을 멈췄어요. 레이어를 줄이거나 다시 재생해 보세요. 저장된 카드는 서버가 그려요.
        </p>
      )}
      {animated && (
        <p className="pt-1 text-2xs text-muted-foreground/80">
          움직이는 카드는 디스코드에서 애니메이션 WebP로 가요. 디스코드의 “동작 줄이기”를 켠 사용자에게는 정지 이미지로 보여요.
        </p>
      )}
      {previewError && previewSrc && (
        <p className="pt-1 text-2xs text-muted-foreground/80">
          최근 변경을 미리보기에 반영하지 못했어요. 저장된 카드는 서버가 그려요.
        </p>
      )}
    </div>
  );
}
