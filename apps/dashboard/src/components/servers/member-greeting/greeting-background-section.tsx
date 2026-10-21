"use client";

import { useRef } from "react";
import { ImagePlus } from "lucide-react";

import { SectionLabel } from "@/components/primitives/section-label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type GreetingImage,PRESET_BACKGROUNDS } from "@/types/member-greeting";

import { PresetSwatch } from "./preset-swatch";
import { ACCEPTED_IMAGE_TYPES } from "./use-greeting-upload";

interface GreetingBackgroundSectionProps {
  background: GreetingImage["background"];
  saving: boolean;
  uploading: boolean;
  /** 프리셋 배경을 골라요 — 커스텀 배경 업로드는 되돌리기로만 해제돼요 */
  onSelectPreset: (presetId: string) => void;
  onUpload: (file: File | null) => Promise<void>;
  /** 마지막으로 선택한 프리셋으로 되돌려요 (하드코딩 없이) */
  onReset: () => void;
}

/** 배경 — 프리셋 선택, 커스텀 이미지 업로드, 업로드 해제(배경 초기화) */
export function GreetingBackgroundSection({
  background,
  saving,
  uploading,
  onSelectPreset,
  onUpload,
  onReset,
}: GreetingBackgroundSectionProps) {
  const backgroundFileInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <SectionLabel as="p">배경</SectionLabel>
      <div
        className="flex flex-wrap gap-2"
        role="radiogroup"
        aria-label="카드 배경 프리셋"
      >
        {PRESET_BACKGROUNDS.map((preset) => {
          const selected =
            background.presetId === preset.id && !background.dataUri;
          return (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={saving}
              onClick={() => onSelectPreset(preset.id)}
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
            void onUpload(event.target.files?.[0] ?? null);
            event.target.value = "";
          }}
        />
        <Button
          variant="secondary"
          size="sm"
          icon={<ImagePlus size={14} />}
          loading={uploading}
          onClick={() => backgroundFileInputRef.current?.click()}
          disabled={saving}
          className="pointer-coarse:h-11"
        >
          커스텀 배경 업로드
        </Button>
        {background.dataUri && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            disabled={saving || uploading}
            className="pointer-coarse:h-11"
          >
            배경 초기화
          </Button>
        )}
      </div>
      <p className="px-3 text-2xs text-muted-foreground">
        3MB 이하 PNG·JPEG·WebP는 JPEG(긴 변 1600px)로 줄여 저장돼요.
      </p>
    </>
  );
}
