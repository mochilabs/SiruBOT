"use client";

import { useState } from "react";
import { LayoutTemplate } from "lucide-react";

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
import { GREETING_TEMPLATES } from "@/types/member-greeting";

export type GreetingTemplate = (typeof GREETING_TEMPLATES)[number];

interface GreetingTemplateSectionProps {
  saving: boolean;
  /** 템플릿을 적용하면 배경과 레이어가 모두 바뀌어요 (실행취소로 되돌릴 수 있어요) */
  onApply: (template: GreetingTemplate) => void;
}

/** 템플릿 — 미리 조립된 배경·레이어 조합을 적용해요. 적용 전 확인 대화상자를 거쳐요 */
export function GreetingTemplateSection({
  saving,
  onApply,
}: GreetingTemplateSectionProps) {
  const [pendingTemplate, setPendingTemplate] =
    useState<GreetingTemplate | null>(null);

  return (
    <>
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
                if (pendingTemplate) onApply(pendingTemplate);
                setPendingTemplate(null);
              }}
            >
              적용
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
