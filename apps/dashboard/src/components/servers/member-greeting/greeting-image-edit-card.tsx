"use client";

import { useState } from "react";
import {
  GreetingConfig,
} from "@sirubot/utils/memberGreeting";
import { ImagePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { GreetingImageEditor } from "./greeting-image-editor";

interface GreetingImageEditCardProps {
  /** 다이얼로그 제목용 — "환영"/"작별" */
  heading: string;
  guildId: string;
  guildName: string | null;
  draft: GreetingConfig;
  saving: boolean;
  visible: boolean;
  onPatch: (next: GreetingConfig) => void;
}

/** 카드 이미지 편집 진입 카드 — 레이어 편집기를 모달로 열어요 */
export function GreetingImageEditCard({
  heading,
  guildId,
  guildName,
  draft,
  saving,
  visible,
  onPatch,
}: GreetingImageEditCardProps) {
  const [editorOpen, setEditorOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-surface-2 p-3">
      <p className="min-w-0 flex-1 text-sm text-muted-foreground">
        카드 이미지와 레이어를 편집해요.
      </p>
      <Button
        variant="secondary"
        size="sm"
        icon={<ImagePlus size={14} />}
        onClick={() => setEditorOpen(true)}
        disabled={saving}
      >
        이미지 편집
      </Button>
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-6xl overflow-y-auto sm:max-h-[90dvh] sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>{heading} 카드 이미지</DialogTitle>
            <DialogDescription>
              미리보기에서 요소를 옮기고, 선택 핸들을 드래그해 크기를
              조절할 수 있어요.
            </DialogDescription>
          </DialogHeader>
          {draft.image && (
            <GreetingImageEditor
              guildId={guildId}
              guildName={guildName}
              config={draft}
              image={draft.image}
              saving={saving}
              active={visible && editorOpen}
              onPatch={onPatch}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
