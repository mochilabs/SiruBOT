"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  ImagePlus,
  LayoutTemplate,
  Redo2,
  Shapes,
  Type,
  Undo2,
  UserRound,
} from "lucide-react";

import { SectionLabel } from "@/components/primitives/section-label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { toApiError, toError } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import {
  GREETING_TEMPLATES,
  type GreetingConfig,
  type GreetingImage,
  type GreetingLayer,
  PRESET_BACKGROUNDS,
} from "@/types/member-greeting";

import {
  CARD_H,
  CARD_W,
  clampRatio,
  createAvatarLayer,
  createImageLayer,
  createShapeLayer,
  createTextLayer,
  drawGreetingPreview,
  hitTestLayer,
  layerBounds,
  loadImage,
  presetGradient,
} from "./greeting-draw";
import { LayerPanel } from "./layer-panel";
import { LayerProperties } from "./layer-properties";
import { useGreetingHistory } from "./use-greeting-history";

const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = "image/png,image/jpeg,image/webp";

/** 단축키·Delete를 무시할 편집 대상(입력 필드·IME) 판별 — 키보드 단축키가 입력을 먹지 않게 해요 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.closest("input, textarea, select, [contenteditable]") !== null
  );
}

interface GreetingImageEditorProps {
  guildId: string;
  guildName: string | null;
  config: GreetingConfig;
  image: GreetingImage;
  saving: boolean;
  /** 탭이 보일 때만 캔버스를 그려요 — 탭 셸이 패널을 마운트 유지하기 때문이에요 */
  active: boolean;
  onPatch: (next: GreetingConfig) => void;
}

/** 레이어 기반 드래그 이미지 편집기 — 캔버스+툴바(좌) / 레이어·속성 사이드 패널(우) 2분할 */
export function GreetingImageEditor({
  guildId,
  guildName,
  config,
  image,
  saving,
  active,
  onPatch,
}: GreetingImageEditorProps) {
  const toast = useToast();
  const { data: session } = useSession();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backgroundFileInputRef = useRef<HTMLInputElement>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [backgroundUploading, setBackgroundUploading] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<
    (typeof GREETING_TEMPLATES)[number] | null
  >(null);

  const avatarSrc = session?.user?.image ?? null;

  // 마지막으로 선택한 배경 프리셋 — 배경 초기화(업로드 되돌리기)가 하드코딩 없이 여기로 복원해요
  const lastPresetRef = useRef<string>(
    image.background.presetId ?? PRESET_BACKGROUNDS[0].id,
  );

  // ── 편집 상태 — imageRef는 patchImage가 동기적으로 갱신해요 (히스토리 커밋이 최신값을 읽기 위함) ──
  const imageRef = useRef(image);
  useEffect(() => {
    imageRef.current = image;
  }, [image]);

  const patchImage = useCallback(
    (next: GreetingImage) => {
      imageRef.current = next;
      onPatch({ ...config, useImage: true, image: next });
    },
    [config, onPatch],
  );

  // ── 되돌리기/다시실행 — 조작 단위로 commit()이 호출돼 한 단계씩 쌓여요 ──
  const { canUndo, canRedo, commit, undo, redo } = useGreetingHistory({
    getSnapshot: () => imageRef.current,
    applySnapshot: patchImage,
  });

  const patchLayer = useCallback(
    (layerId: string, partial: Partial<GreetingLayer>) => {
      patchImage({
        ...image,
        layers: image.layers.map((layer) =>
          layer.id === layerId
            ? ({ ...layer, ...partial } as GreetingLayer)
            : layer,
        ),
      });
    },
    [image, patchImage],
  );

  // ── 캔버스 드로잉 — 편집 상태가 바뀔 때마다 재그려요 ──
  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let cancelled = false;
    void drawGreetingPreview(
      ctx,
      image,
      { selectedId, avatarSrc, guildName: guildName ?? "" },
      () => cancelled,
    );
    return () => {
      cancelled = true;
    };
  }, [active, image, selectedId, avatarSrc, guildName]);

  // ── 드래그 이동 (pointer capture + rAF 스로틀) ──
  const dragRef = useRef<{
    layerId: string;
    pointerId: number;
    mode: "move" | "resize";
    start: { x: number; y: number };
    initial: GreetingLayer;
    bounds: { x: number; y: number; w: number; h: number };
    signX: -1 | 1;
    signY: -1 | 1;
  } | null>(null);
  const dragPointRef = useRef<{ x: number; y: number } | null>(null);
  const dragFrameRef = useRef<number | null>(null);

  const canvasPoint = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * CARD_W,
      y: ((clientY - rect.top) / rect.height) * CARD_H,
    };
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (saving) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const point = canvasPoint(event.clientX, event.clientY);
    if (!point) return;
    const { x: px, y: py } = point;
    const selectedLayer = selectedId
      ? image.layers.find((layer) => layer.id === selectedId && !layer.hidden)
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
    const visible = image.layers.filter((layer) => !layer.hidden);
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

  // ── 레이어 조작 — 각 조작이 되돌리기 한 단계(커밋 1회)예요 ──
  const addLayer = useCallback(
    (layer: GreetingLayer) => {
      patchImage({ ...image, layers: [...image.layers, layer] });
      setSelectedId(layer.id);
      commit();
    },
    [image, patchImage, commit],
  );

  const removeLayer = useCallback(
    (id: string) => {
      patchImage({
        ...image,
        layers: image.layers.filter((layer) => layer.id !== id),
      });
      setSelectedId((prev) => (prev === id ? null : prev));
      commit();
    },
    [image, patchImage, commit],
  );

  const duplicateLayer = useCallback(
    (id: string) => {
      const index = image.layers.findIndex((layer) => layer.id === id);
      if (index < 0) return;
      const source = image.layers[index];
      const copy = { ...source, id: crypto.randomUUID() } as GreetingLayer;
      const next = [...image.layers];
      next.splice(index + 1, 0, copy);
      patchImage({ ...image, layers: next });
      setSelectedId(copy.id);
      commit();
    },
    [image, patchImage, commit],
  );

  const moveLayer = useCallback(
    (id: string, dir: 1 | -1) => {
      const index = image.layers.findIndex((layer) => layer.id === id);
      if (index < 0) return;
      const target = index + dir;
      if (target < 0 || target >= image.layers.length) return;
      const next = [...image.layers];
      [next[index], next[target]] = [next[target], next[index]];
      patchImage({ ...image, layers: next });
      commit();
    },
    [image, patchImage, commit],
  );

  const toggleHidden = useCallback(
    (id: string) => {
      const layer = image.layers.find((item) => item.id === id);
      if (!layer) return;
      patchLayer(id, { hidden: !layer.hidden });
      commit();
    },
    [image, patchLayer, commit],
  );

  const applyTemplate = useCallback(
    (template: (typeof GREETING_TEMPLATES)[number]) => {
      if (template.image.background.presetId) {
        lastPresetRef.current = template.image.background.presetId;
      }
      patchImage({
        background: { ...template.image.background },
        layers: template.image.layers.map((layer) => ({ ...layer })),
      });
      setSelectedId(null);
      setPendingTemplate(null);
      commit();
    },
    [patchImage, commit],
  );

  // ── 배경 — 마지막으로 선택한 프리셋으로 되돌려요 (하드코딩 없이) ──
  const applyPresetBackground = useCallback(
    (presetId: string) => {
      lastPresetRef.current = presetId;
      patchImage({ ...image, background: { presetId, dataUri: null } });
      commit();
    },
    [image, patchImage, commit],
  );

  const resetBackground = useCallback(() => {
    patchImage({
      ...image,
      background: { presetId: lastPresetRef.current, dataUri: null },
    });
    commit();
  }, [image, patchImage, commit]);

  // ── 업로드 (이미지 레이어 / 커스텀 배경) — POST /background로 dataURI 정규화를 재사용해요 ──
  const uploadFile = useCallback(
    async (
      file: File | null,
      mode: "layer" | "background",
    ): Promise<string | null> => {
      if (!file) return null;
      if (file.size > MAX_UPLOAD_BYTES) {
        toast.error("이미지가 너무 커요. 최대 3MB까지 올릴 수 있어요.");
        return null;
      }
      if (!`${ACCEPTED_IMAGE_TYPES},`.includes(`${file.type},`)) {
        toast.error("PNG, JPEG, WebP 이미지만 지원해요.");
        return null;
      }
      const form = new FormData();
      form.append("file", file);
      const endpoint = mode === "layer" ? "layer-image" : "background";
      const res = await fetch(`/api/servers/${guildId}/greeting/${endpoint}`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw await toApiError(res, "이미지를 준비하지 못했어요.");
      const body = (await res.json()) as { dataUri?: unknown };
      if (
        typeof body.dataUri !== "string" ||
        !body.dataUri.startsWith("data:image/")
      ) {
        throw new Error("이미지 응답이 올바르지 않아요.");
      }
      return body.dataUri;
    },
    [guildId, toast],
  );

  const handleImageUpload = useCallback(
    async (file: File | null) => {
      setUploading(true);
      try {
        const dataUri = await uploadFile(file, "layer");
        if (!dataUri) return;
        const img = await loadImage(dataUri);
        let width = 400;
        let height = 400;
        if (img && img.naturalWidth > 0) {
          width = 400;
          height = Math.max(
            1,
            Math.round((400 * img.naturalHeight) / img.naturalWidth),
          );
        }
        addLayer(createImageLayer(dataUri, width, height));
        toast.success("이미지 레이어를 추가했어요.");
      } catch (err) {
        const apiError = toError(err, "이미지를 준비하지 못했어요.");
        toast.error(
          apiError.message,
          apiError.retryable ? "잠시 후 다시 시도해 주세요." : undefined,
        );
      } finally {
        setUploading(false);
      }
    },
    [addLayer, uploadFile, toast],
  );

  const handleBackgroundUpload = useCallback(
    async (file: File | null) => {
      setBackgroundUploading(true);
      try {
        const dataUri = await uploadFile(file, "background");
        if (!dataUri) return;
        patchImage({ ...image, background: { presetId: null, dataUri } });
        commit();
        toast.success(
          "배경 이미지를 넣었어요.",
          "인사 설정을 저장하면 모든 카드에 적용돼요.",
        );
      } catch (err) {
        const apiError = toError(err, "배경 이미지를 준비하지 못했어요.");
        toast.error(
          apiError.message,
          apiError.retryable ? "잠시 후 다시 시도해 주세요." : undefined,
        );
      } finally {
        setBackgroundUploading(false);
      }
    },
    [image, patchImage, commit, uploadFile, toast],
  );

  const selectedLayer = selectedId
    ? (image.layers.find((layer) => layer.id === selectedId) ?? null)
    : null;

  // ── 키보드 — Ctrl/Cmd+Z 되돌리기 · Ctrl/Cmd+Shift+Z 다시실행 · Delete/Backspace 선택 레이어 삭제 ──
  useEffect(() => {
    if (!active) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (saving) return;
      // IME 조합 중이거나 입력 필드에 타이핑 중이면 단축키를 쓰지 않아요
      if (event.isComposing || event.keyCode === 229) return;
      if (isEditableTarget(event.target)) return;
      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        const key = event.key.toLowerCase();
        if (key === "z") {
          event.preventDefault();
          if (event.shiftKey) redo();
          else undo();
          return;
        }
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (!selectedId) return;
        if (!image.layers.some((layer) => layer.id === selectedId)) return;
        event.preventDefault();
        removeLayer(selectedId);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, saving, undo, redo, selectedId, image, removeLayer]);

  return (
    <div className="min-w-0 rounded-card bg-surface-2 p-4">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        {/* 미리보기 — 모바일은 맨 위, 데스크톱은 좌상단 */}
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
                onClick={undo}
              />
              <Button
                variant="icon"
                size="sm"
                icon={<Redo2 size={14} />}
                aria-label="다시실행"
                title="다시실행 (Ctrl+Shift+Z)"
                disabled={saving || !canRedo}
                onClick={redo}
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
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />
        </div>

        {/* 레이어 + 속성 — 모바일은 캔버스 바로 뒤, 데스크톱은 우측 스티키 패널(독립 스크롤) */}
        <div className="min-w-0 space-y-4 lg:sticky lg:top-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:max-h-[calc(90dvh-11rem)] lg:overflow-y-auto lg:overscroll-contain">
          <SectionLabel as="p">레이어</SectionLabel>
          <LayerPanel
            layers={image.layers}
            selectedId={selectedId}
            saving={saving}
            onSelect={setSelectedId}
            onToggleHidden={toggleHidden}
            onRemove={removeLayer}
            onDuplicate={duplicateLayer}
            onMove={moveLayer}
          />

          <SectionLabel as="p">선택한 레이어 속성</SectionLabel>
          <LayerProperties
            layer={selectedLayer}
            saving={saving}
            onPatchLayer={patchLayer}
            onCommit={commit}
          />
        </div>

        {/* 배경 · 템플릿 · 요소 추가 — 모바일은 사이드 패널 뒤, 데스크톱은 캔버스 아래 */}
        <div className="min-w-0 space-y-3 lg:col-start-1 lg:row-start-2">
          <SectionLabel as="p">배경</SectionLabel>
          <div
            className="flex flex-wrap gap-2"
            role="radiogroup"
            aria-label="카드 배경 프리셋"
          >
            {PRESET_BACKGROUNDS.map((preset) => {
              const selected =
                image.background.presetId === preset.id &&
                !image.background.dataUri;
              return (
                <button
                  key={preset.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={saving}
                  onClick={() => applyPresetBackground(preset.id)}
                  className={cn(
                    "pointer-coarse:h-11 w-fit cursor-pointer rounded-control p-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected && "ring-2 ring-ring/40",
                  )}
                >
                  <PresetSwatch id={preset.id} />
                  <span className="block pt-1 text-2xs font-medium text-foreground">
                    {preset.name}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={backgroundFileInputRef}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES}
              className="sr-only"
              onChange={(event) => {
                void handleBackgroundUpload(event.target.files?.[0] ?? null);
                event.target.value = "";
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              icon={<ImagePlus size={14} />}
              loading={backgroundUploading}
              onClick={() => backgroundFileInputRef.current?.click()}
              disabled={saving}
              className="pointer-coarse:h-11"
            >
              커스텀 배경 업로드
            </Button>
            {image.background.dataUri && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetBackground}
                disabled={saving || backgroundUploading}
                className="pointer-coarse:h-11"
              >
                배경 초기화
              </Button>
            )}
          </div>
          <p className="px-3 text-2xs text-muted-foreground">
            3MB 이하 PNG·JPEG·WebP는 JPEG(긴 변 1600px)로 줄여 저장돼요.
          </p>

          <SectionLabel as="p">템플릿</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {GREETING_TEMPLATES.map((template) => (
              <Button
                key={template.id}
                variant="secondary"
                size="sm"
                icon={<LayoutTemplate size={14} />}
                disabled={saving}
                onClick={() => setPendingTemplate(template)}
                className="pointer-coarse:h-11"
              >
                {template.name}
              </Button>
            ))}
          </div>
          <Dialog
            open={pendingTemplate !== null}
            onOpenChange={(open) => {
              if (!open) setPendingTemplate(null);
            }}
          >
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>템플릿을 적용할까요?</DialogTitle>
                <DialogDescription>
                  {pendingTemplate?.name ?? ""} 템플릿을 적용하면 지금까지 편집한
                  배경과 레이어가 모두 바뀌어요. 실행취소(Ctrl+Z)로 되돌릴 수
                  있어요.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPendingTemplate(null)}
                >
                  취소
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!pendingTemplate || saving}
                  onClick={() => {
                    if (pendingTemplate) applyTemplate(pendingTemplate);
                  }}
                >
                  적용
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <SectionLabel as="p">요소 추가</SectionLabel>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<Type size={14} />}
              disabled={saving}
              onClick={() => addLayer(createTextLayer())}
              className="pointer-coarse:h-11"
            >
              텍스트
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<UserRound size={14} />}
              disabled={saving}
              onClick={() => addLayer(createAvatarLayer())}
              className="pointer-coarse:h-11"
            >
              아바타
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<Shapes size={14} />}
              disabled={saving}
              onClick={() => addLayer(createShapeLayer())}
              className="pointer-coarse:h-11"
            >
              도형
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES}
              className="sr-only"
              onChange={(event) => {
                void handleImageUpload(event.target.files?.[0] ?? null);
                event.target.value = "";
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              icon={<ImagePlus size={14} />}
              loading={uploading}
              disabled={saving}
              onClick={() => fileInputRef.current?.click()}
              className="pointer-coarse:h-11"
            >
              이미지
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 프리셋 그라디언트 스와치 — 서버 렌더러와 같은 그라디언트를 작은 캔버스로 그려요 */
function PresetSwatch({ id }: { id: string }) {
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
