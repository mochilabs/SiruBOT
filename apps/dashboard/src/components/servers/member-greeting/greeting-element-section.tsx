"use client";

import { useRef } from "react";
import { ImagePlus, Shapes, Type, UserRound } from "lucide-react";

import { SectionLabel } from "@/components/primitives/section-label";
import { Button } from "@/components/ui/button";

import { ACCEPTED_IMAGE_TYPES } from "./use-greeting-upload";

interface GreetingElementSectionProps {
  saving: boolean;
  uploading: boolean;
  onAddText: () => void;
  onAddAvatar: () => void;
  onAddShape: () => void;
  onUploadImage: (file: File | null) => Promise<void>;
}

/** 요소 추가 — 텍스트·아바타·도형 레이어를 넣거나 이미지를 올려 레이어로 추가해요 */
export function GreetingElementSection({
  saving,
  uploading,
  onAddText,
  onAddAvatar,
  onAddShape,
  onUploadImage,
}: GreetingElementSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <SectionLabel as="p">요소 추가</SectionLabel>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          icon={<Type size={14} />}
          disabled={saving}
          onClick={onAddText}
        >
          텍스트
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={<UserRound size={14} />}
          disabled={saving}
          onClick={onAddAvatar}
        >
          아바타
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={<Shapes size={14} />}
          disabled={saving}
          onClick={onAddShape}
        >
          도형
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES}
          className="sr-only"
          onChange={(event) => {
            void onUploadImage(event.target.files?.[0] ?? null);
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
        >
          이미지
        </Button>
      </div>
    </>
  );
}
