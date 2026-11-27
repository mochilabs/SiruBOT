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
  active: boolean;
  onPatch: (next: GreetingConfig) => void;
}

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

  const [rawSelectedIds, setSelectedIds] = useState<string[]>([]);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [overlay, setOverlay] = useState<GreetingOverlay>({});

  const avatarSrc = session?.user?.image ?? null;

  const lastPresetRef = useRef<string>(
    image.background.presetId ?? PRESET_BACKGROUNDS[0].id,
  );

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

  const preview = useGreetingSvg({
    active,
    image,
    avatarSrc,
    guildName: guildName ?? "",
    paused: dragging,
  });

  useEffect(() => {
    if (!active) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawGreetingSelection(ctx, image, selectedIds, overlay);
  }, [active, image, selectedIds, overlay]);

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

  const { uploading, backgroundUploading, handleImageUpload, handleBackgroundUpload } =
    useGreetingUpload({ guildId, image, patchImage, commit, addLayer });

  const selectedLayer =
    selectedIds.length === 1 ? (image.layers.find((layer) => layer.id === selectedIds[0]) ?? null) : null;

  const selectFromPanel = useCallback((id: string, additive: boolean) => {
    setSelectedIds((prev) =>
      additive ? (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]) : [id],
    );
  }, []);

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
      <div className="grid grid-cols-1 gap-5 lg:h-[calc(90dvh-11rem)] lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[auto_minmax(0,1fr)]">
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

        <div className="min-w-0 space-y-4 lg:-mx-1.5 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:px-1.5 lg:py-1.5">
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

        <div className="min-w-0 space-y-3 lg:-mx-1.5 lg:col-start-1 lg:row-start-2 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:px-1.5 lg:py-1">
          <GreetingBackgroundSection
            background={image.background}
            saving={saving}
            uploading={backgroundUploading}
            onSelectPreset={applyPresetBackground}
            onUpload={handleBackgroundUpload}
            onReset={resetBackground}
          />
          <GreetingTemplateSection saving={saving} avatarSrc={avatarSrc} guildName={guildName ?? ""} onApply={applyTemplate} />
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
