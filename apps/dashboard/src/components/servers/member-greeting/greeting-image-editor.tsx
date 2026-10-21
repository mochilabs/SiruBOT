"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";

import { SectionLabel } from "@/components/primitives/section-label";
import {
  type GreetingConfig,
  type GreetingImage,
  type GreetingLayer,
  PRESET_BACKGROUNDS,
} from "@/types/member-greeting";

import { GreetingBackgroundSection } from "./greeting-background-section";
import {
  createAvatarLayer,
  createShapeLayer,
  createTextLayer,
  drawGreetingPreview,
} from "./greeting-draw";
import { GreetingElementSection } from "./greeting-element-section";
import { GreetingPreviewSection } from "./greeting-preview-section";
import { type GreetingTemplate, GreetingTemplateSection } from "./greeting-template-section";
import { LayerPanel } from "./layer-panel";
import { LayerProperties } from "./layer-properties";
import { useGreetingDrag } from "./use-greeting-drag";
import { useGreetingHistory } from "./use-greeting-history";
import { useGreetingShortcuts } from "./use-greeting-shortcuts";
import { useGreetingUpload } from "./use-greeting-upload";

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
  const { data: session } = useSession();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  // ── 드래그 이동·리사이즈 (pointer capture + rAF 스로틀) ──
  const { handlePointerDown, handlePointerMove, endDrag } = useGreetingDrag({
    canvasRef,
    saving,
    layers: image.layers,
    selectedId,
    setSelectedId,
    patchLayer,
    commit,
  });

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
    (template: GreetingTemplate) => {
      if (template.image.background.presetId) {
        lastPresetRef.current = template.image.background.presetId;
      }
      patchImage({
        background: { ...template.image.background },
        layers: template.image.layers.map((layer) => ({ ...layer })),
      });
      setSelectedId(null);
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

  // ── 업로드 (이미지 레이어 / 커스텀 배경) ──
  const { uploading, backgroundUploading, handleImageUpload, handleBackgroundUpload } =
    useGreetingUpload({ guildId, image, patchImage, commit, addLayer });

  const selectedLayer = selectedId
    ? (image.layers.find((layer) => layer.id === selectedId) ?? null)
    : null;

  // ── 키보드 단축키 (되돌리기·다시실행·삭제) ──
  useGreetingShortcuts({
    active,
    saving,
    undo,
    redo,
    selectedId,
    layers: image.layers,
    removeLayer,
  });

  return (
    <div className="min-w-0 rounded-card bg-surface-2 p-4">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        {/* 미리보기 — 모바일은 맨 위, 데스크톱은 좌상단 */}
        <GreetingPreviewSection
          canvasRef={canvasRef}
          saving={saving}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={undo}
          onRedo={redo}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerEnd={endDrag}
        />

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
          <GreetingBackgroundSection
            background={image.background}
            saving={saving}
            uploading={backgroundUploading}
            onSelectPreset={applyPresetBackground}
            onUpload={handleBackgroundUpload}
            onReset={resetBackground}
          />
          <GreetingTemplateSection saving={saving} onApply={applyTemplate} />
          <GreetingElementSection
            saving={saving}
            uploading={uploading}
            onAddText={() => addLayer(createTextLayer())}
            onAddAvatar={() => addLayer(createAvatarLayer())}
            onAddShape={() => addLayer(createShapeLayer())}
            onUploadImage={handleImageUpload}
          />
        </div>
      </div>
    </div>
  );
}
