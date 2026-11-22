"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  type GreetingConfig,
  type GreetingImage,
  type GreetingLayer,
  PRESET_BACKGROUNDS,
} from "@sirubot/utils/memberGreeting";

import { SectionLabel } from "@/components/primitives/section-label";

import { GreetingBackgroundSection } from "./greeting-background-section";
import {
  appendWithinLimit,
  cloneLayers,
  copyLayers,
  MAX_GREETING_LAYERS,
  pasteLayers,
} from "./greeting-clipboard";
import {
  clampRatio,
  createAvatarLayer,
  createShapeLayer,
  createTextLayer,
  drawGreetingSelection,
  type GreetingOverlay,
} from "./greeting-draw";
import { GreetingElementSection } from "./greeting-element-section";
import { GreetingPreviewSection } from "./greeting-preview-section";
import { type GreetingTemplate, GreetingTemplateSection } from "./greeting-template-section";
import { LayerPanel } from "./layer-panel";
import { LayerProperties } from "./layer-properties";
import { useGreetingDrag } from "./use-greeting-drag";
import { useGreetingHistory } from "./use-greeting-history";
import { useGreetingShortcuts } from "./use-greeting-shortcuts";
import { useGreetingSvg } from "./use-greeting-svg";
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

  // 선택은 id 배열이에요 (마지막 = 가장 최근에 고른 레이어). 되돌리기로 사라진 레이어 id는 아래에서 걸러내요
  const [rawSelectedIds, setSelectedIds] = useState<string[]>([]);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [overlay, setOverlay] = useState<GreetingOverlay>({});

  const avatarSrc = session?.user?.image ?? null;

  // 마지막으로 선택한 배경 프리셋 — 배경 초기화(업로드 되돌리기)가 하드코딩 없이 여기로 복원해요
  const lastPresetRef = useRef<string>(
    image.background.presetId ?? PRESET_BACKGROUNDS[0].id,
  );

  // 편집 상태: imageRef는 patchImage가 동기적으로 갱신해요 (히스토리 커밋이 최신값을 읽기 위함)
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

  // 되돌리기/다시실행: 조작 단위로 commit()이 호출돼 한 단계씩 쌓여요
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

  const patchLayers = useCallback(
    (partials: Record<string, Partial<GreetingLayer>>) => {
      patchImage({
        ...image,
        layers: image.layers.map((layer) =>
          partials[layer.id] ? ({ ...layer, ...partials[layer.id] } as GreetingLayer) : layer,
        ),
      });
    },
    [image, patchImage],
  );

  const selectedIds = useMemo(
    () => rawSelectedIds.filter((id) => image.layers.some((layer) => layer.id === id)),
    [rawSelectedIds, image.layers],
  );

  // 드래그 이동(다중·스냅)·리사이즈·마퀴 선택 (pointer capture + rAF 스로틀). 드래그 중에는 선택 박스만 따라가요
  const { handlePointerDown, handlePointerMove, endDrag, dragging } = useGreetingDrag({
    canvasRef,
    saving,
    layers: image.layers,
    selectedIds,
    setSelectedIds,
    patchLayers,
    commit,
    snapEnabled,
    setOverlay,
  });

  // 카드 본체: 서버와 같은 greetingCard를 Takumi WASM으로 그려요 — 드래그 중엔 멈추고 놓을 때·입력 150ms 뒤에 다시 그려요.
  // 움직임이 있으면 재생·타임라인 조작도 이 훅이 맡아요 (서버는 같은 키프레임으로 애니메이션 WebP를 만들어요)
  const preview = useGreetingSvg({
    active,
    image,
    avatarSrc,
    guildName: guildName ?? "",
    paused: dragging,
  });

  // 선택 오버레이: 투명 canvas에 선택 테두리·핸들만 그려요 (가벼워서 바로 갱신)
  useEffect(() => {
    if (!active) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawGreetingSelection(ctx, image, selectedIds, overlay);
  }, [active, image, selectedIds, overlay]);

  // 레이어 조작: 각 조작이 되돌리기 한 단계(커밋 1회)예요
  const addLayer = useCallback(
    (layer: GreetingLayer) => {
      patchImage({ ...image, layers: [...image.layers, layer] });
      setSelectedIds([layer.id]);
      commit();
    },
    [image, patchImage, commit],
  );

  const removeLayers = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      patchImage({
        ...image,
        layers: image.layers.filter((layer) => !ids.includes(layer.id)),
      });
      setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
      commit();
    },
    [image, patchImage, commit],
  );
  const removeLayer = useCallback((id: string) => removeLayers([id]), [removeLayers]);

  // 복제 — 각 복사본이 원본 바로 위에 쌓이고 조금 비껴 놓여요 (겹쳐서 안 보이는 일이 없게)
  const duplicateLayers = useCallback(
    (ids: string[]) => {
      const sources = image.layers.filter((layer) => ids.includes(layer.id));
      if (sources.length === 0 || image.layers.length + sources.length > MAX_GREETING_LAYERS) return;
      const copies = new Map(cloneLayers(sources).map((copy, index) => [sources[index].id, copy]));
      const next = image.layers.flatMap((layer) => {
        const copy = copies.get(layer.id);
        return copy ? [layer, copy] : [layer];
      });
      patchImage({ ...image, layers: next });
      setSelectedIds([...copies.values()].map((copy) => copy.id));
      commit();
    },
    [image, patchImage, commit],
  );
  const duplicateLayer = useCallback((id: string) => duplicateLayers([id]), [duplicateLayers]);

  const copySelected = useCallback(() => {
    copyLayers(image.layers, selectedIds);
  }, [image.layers, selectedIds]);

  const pasteClipboard = useCallback(() => {
    const pasted = pasteLayers();
    if (pasted.length === 0) return;
    const next = appendWithinLimit(image.layers, pasted);
    if (next.length === image.layers.length) return;
    patchImage({ ...image, layers: next });
    setSelectedIds(next.slice(image.layers.length).map((layer) => layer.id));
    commit();
  }, [image, patchImage, commit]);

  // 방향키 이동 — 키를 누르고 있어도 되돌리기 한 단계로 묶이게 멈춘 뒤에 커밋해요
  const nudgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
    },
    [],
  );
  const nudgeSelected = useCallback(
    (dxPercent: number, dyPercent: number) => {
      const partials: Record<string, Partial<GreetingLayer>> = {};
      for (const layer of image.layers) {
        if (!selectedIds.includes(layer.id)) continue;
        partials[layer.id] = { x: clampRatio(layer.x + dxPercent), y: clampRatio(layer.y + dyPercent) };
      }
      patchLayers(partials);
      if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
      nudgeTimerRef.current = setTimeout(commit, 400);
    },
    [image.layers, selectedIds, patchLayers, commit],
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
      setSelectedIds([]);
      commit();
    },
    [patchImage, commit],
  );

  // 배경: 마지막으로 선택한 프리셋으로 되돌려요 (하드코딩 없이)
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

  // 업로드 (이미지 레이어 / 커스텀 배경)
  const { uploading, backgroundUploading, handleImageUpload, handleBackgroundUpload } =
    useGreetingUpload({ guildId, image, patchImage, commit, addLayer });

  const selectedLayer =
    selectedIds.length === 1 ? (image.layers.find((layer) => layer.id === selectedIds[0]) ?? null) : null;

  // 레이어 패널 클릭: Shift/Ctrl/Cmd면 선택 토글, 아니면 그 레이어만 선택
  const selectFromPanel = useCallback((id: string, additive: boolean) => {
    setSelectedIds((prev) =>
      additive ? (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]) : [id],
    );
  }, []);

  // 키보드 단축키 (되돌리기·다시실행·삭제·복사·붙여넣기·복제·전체 선택·방향키 이동)
  const shortcutActions = useMemo(
    () => ({
      undo,
      redo,
      removeSelected: () => removeLayers(selectedIds),
      copySelected,
      cutSelected: () => {
        copySelected();
        removeLayers(selectedIds);
      },
      paste: pasteClipboard,
      duplicateSelected: () => duplicateLayers(selectedIds),
      selectAll: () =>
        setSelectedIds(image.layers.filter((layer) => !layer.hidden).map((layer) => layer.id)),
      clearSelection: () => setSelectedIds([]),
      nudgeSelected,
    }),
    [undo, redo, removeLayers, selectedIds, copySelected, pasteClipboard, duplicateLayers, image.layers, nudgeSelected],
  );
  useGreetingShortcuts({
    active,
    saving,
    hasSelection: selectedIds.length > 0,
    actions: shortcutActions,
  });

  return (
    <div className="min-w-0 rounded-card bg-surface-2 p-4">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        {/* 미리보기 — 모바일은 맨 위, 데스크톱은 좌상단 */}
        <GreetingPreviewSection
          canvasRef={canvasRef}
          previewSrc={preview.src}
          previewError={preview.error}
          animated={preview.animated}
          playing={preview.playing}
          autoPaused={preview.autoPaused}
          timeMs={preview.timeMs}
          durationMs={preview.durationMs}
          onTogglePlay={() => preview.setPlaying(!preview.playing)}
          onSeek={preview.seek}
          saving={saving}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={undo}
          onRedo={redo}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerEnd={endDrag}
          snapEnabled={snapEnabled}
          onToggleSnap={() => setSnapEnabled((prev) => !prev)}
        />

        {/* 레이어 + 속성 — 모바일은 캔버스 바로 뒤, 데스크톱은 우측 스티키 패널(독립 스크롤) */}
        <div className="min-w-0 space-y-4 lg:sticky lg:top-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:max-h-[calc(90dvh-11rem)] lg:overflow-y-auto lg:overscroll-contain">
          <SectionLabel as="p">레이어</SectionLabel>
          <LayerPanel
            layers={image.layers}
            selectedIds={selectedIds}
            saving={saving}
            onSelect={selectFromPanel}
            onToggleHidden={toggleHidden}
            onRemove={removeLayer}
            onDuplicate={duplicateLayer}
            onMove={moveLayer}
          />

          <SectionLabel as="p">선택한 레이어 속성</SectionLabel>
          <LayerProperties
            layer={selectedLayer}
            selectedCount={selectedIds.length}
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
