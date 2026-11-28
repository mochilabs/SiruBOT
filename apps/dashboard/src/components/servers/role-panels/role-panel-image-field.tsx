"use client";

import { useRef, useState } from "react";
import type { RolePanelImageLayout, RolePanelImagePosition } from "@sirubot/utils/rolePanel";
import { Images, Loader2, Upload, X } from "lucide-react";

import { Field } from "@/components/primitives/field";
import { Button } from "@/components/ui/button";
import { COLOR_PRESETS, ColorPicker } from "@/components/ui/color-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ASSET_ALLOWED_MIME } from "@/hooks/use-guild-assets";
import { notifyApiError } from "@/lib/notify";

import { AssetPicker, uploadAssetFile } from "../asset-picker";

import { DEFAULT_ACCENT_COLOR_HEX, IMAGE_LAYOUT_LABELS, IMAGE_POSITION_LABELS } from "./role-panel-meta";

/** Panel image (upload, asset library, layout and position) plus the container accent color. */
export function RolePanelImageField({
  guildId,
  saving,
  imageUrl,
  onImageUrlChange: setImageUrl,
  imageLayout,
  onImageLayoutChange: setImageLayout,
  imagePosition,
  onImagePositionChange: setImagePosition,
  accentColor,
  onAccentColorChange: setAccentColor,
}: {
  guildId: string;
  saving: boolean;
  imageUrl: string | null;
  onImageUrlChange: (url: string | null) => void;
  imageLayout: RolePanelImageLayout;
  onImageLayoutChange: (layout: RolePanelImageLayout) => void;
  imagePosition: RolePanelImagePosition;
  onImagePositionChange: (position: RolePanelImagePosition) => void;
  accentColor: string | null;
  onAccentColorChange: (color: string | null) => void;
}) {
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (file: File | null) => {
    if (!file) return;
    setUploadingImage(true);
    try {
      const asset = await uploadAssetFile(guildId, file);
      setImageUrl(asset.url);
    } catch (err) {
      notifyApiError(err, "이미지를 업로드하지 못했어요.");
    } finally {
      setUploadingImage(false);
    }
  };

  return (
    <Field
      label="이미지와 강조색"
      description="이미지는 선택이에요. (PNG·JPEG·WebP·GIF 최대 8MB) 강조색은 메시지 컨테이너 왼쪽 선 색이에요."
    >
      <div className="space-y-4 rounded-card bg-surface-1 p-4">
        <div className="flex flex-wrap items-center gap-3">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt="패널 이미지"
              className="h-14 w-14 shrink-0 rounded-control object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-control bg-surface-2 text-muted-foreground">
              <Images size={18} aria-hidden />
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={ASSET_ALLOWED_MIME.join(",")}
            className="sr-only"
            onChange={(event) => {
              void handleImageUpload(event.target.files?.[0] ?? null);
              event.target.value = "";
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={saving || uploadingImage}
            >
              {uploadingImage ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Upload size={14} />
              )}
              {uploadingImage ? "업로드 중…" : "업로드"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAssetPickerOpen(true)}
              disabled={saving || uploadingImage}
            >
              <Images size={14} /> 에셋 보관함
            </Button>
            {imageUrl ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setImageUrl(null)}
                disabled={saving || uploadingImage}
              >
                <X size={14} /> 제거
              </Button>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              이미지 표시 방식
            </span>
            <Select
              value={imageLayout}
              onValueChange={(value) =>
                value && setImageLayout(value as RolePanelImageLayout)
              }
              disabled={saving || !imageUrl}
            >
              <SelectTrigger className="w-full" aria-label="이미지 표시 방식">
                <SelectValue>
                  {(value: RolePanelImageLayout) =>
                    IMAGE_LAYOUT_LABELS[value] ?? value
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(IMAGE_LAYOUT_LABELS) as RolePanelImageLayout[]).map(
                  (value) => (
                    <SelectItem key={value} value={value}>
                      {IMAGE_LAYOUT_LABELS[value]}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              이미지 위치
              {imageLayout === "thumbnail" ? " (섬네일은 고정)" : ""}
            </span>
            <Select
              value={imagePosition}
              onValueChange={(value) =>
                value && setImagePosition(value as RolePanelImagePosition)
              }
              disabled={saving || !imageUrl || imageLayout === "thumbnail"}
            >
              <SelectTrigger className="w-full" aria-label="이미지 위치">
                <SelectValue>
                  {(value: RolePanelImagePosition) =>
                    IMAGE_POSITION_LABELS[value] ?? value
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(IMAGE_POSITION_LABELS) as RolePanelImagePosition[]).map(
                  (value) => (
                    <SelectItem key={value} value={value}>
                      {IMAGE_POSITION_LABELS[value]}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5 border-t border-border-subtle pt-4">
          <span className="text-xs font-medium text-muted-foreground">
            컨테이너 강조색
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <ColorPicker
              value={accentColor ?? DEFAULT_ACCENT_COLOR_HEX}
              label="강조색"
              disabled={saving}
              presets={[DEFAULT_ACCENT_COLOR_HEX, ...COLOR_PRESETS]}
              onChange={setAccentColor}
            />
            {accentColor !== null && (
              <Button
                variant="ghost"
                size="sm"
                disabled={saving}
                onClick={() => setAccentColor(null)}
              >
                봇 기본색 사용
              </Button>
            )}
          </div>
        </div>
      </div>
      <AssetPicker
        guildId={guildId}
        open={assetPickerOpen}
        onClose={() => setAssetPickerOpen(false)}
        onSelect={(urls) => {
          if (urls[0]) setImageUrl(urls[0]);
        }}
      />
    </Field>
  );
}
