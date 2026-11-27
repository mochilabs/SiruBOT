"use client";

import { useEffect, useState } from "react";
import {
  GREETING_TEMPLATES,
} from "@sirubot/utils/memberGreeting";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { GreetingCollapsible } from "./greeting-collapsible";
import { renderGreetingPreviewUrl } from "./greeting-svg";

export type GreetingTemplate = (typeof GREETING_TEMPLATES)[number];

const THUMB_SCALE = 0.25;

let thumbQueue: Promise<unknown> = Promise.resolve();
const thumbCache = new Map<string, string>();

function renderThumb(template: GreetingTemplate, avatarSrc: string | null, guildName: string): Promise<string> {
  const key = `${template.id}|${avatarSrc ?? ""}|${guildName}`;
  const cached = thumbCache.get(key);
  if (cached) return Promise.resolve(cached);
  const job = thumbQueue.then(() =>
    renderGreetingPreviewUrl(template.image, { avatarSrc, guildName, scale: THUMB_SCALE }).then((url) => {
      thumbCache.set(key, url);
      return url;
    }),
  );
  thumbQueue = job.catch(() => undefined);
  return job;
}

function TemplateThumb({ template, avatarSrc, guildName }: { template: GreetingTemplate; avatarSrc: string | null; guildName: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    renderThumb(template, avatarSrc, guildName).then(
      (url) => { if (!cancelled) setSrc(url); },
      () => undefined,
    );
    return () => { cancelled = true; };
  }, [template, avatarSrc, guildName]);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- data URL 썸네일이라 next/image 최적화 대상이 아니에요
    <img src={src} alt="" className="block aspect-video w-full rounded-sm object-cover" />
  ) : (
    <div className="aspect-video w-full animate-pulse rounded-sm bg-surface-3" aria-hidden />
  );
}

interface GreetingTemplateSectionProps {
  saving: boolean;
  avatarSrc: string | null;
  guildName: string;
  onApply: (template: GreetingTemplate) => void;
}

export function GreetingTemplateSection({
  saving,
  avatarSrc,
  guildName,
  onApply,
}: GreetingTemplateSectionProps) {
  const [pendingTemplate, setPendingTemplate] =
    useState<GreetingTemplate | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <GreetingCollapsible title="템플릿" summary={`${GREETING_TEMPLATES.length}개`} open={open} onOpenChange={setOpen}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {GREETING_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              disabled={saving}
              onClick={() => setPendingTemplate(template)}
              className="cursor-pointer rounded-control p-1 text-left transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
            >
              <TemplateThumb template={template} avatarSrc={avatarSrc} guildName={guildName} />
              <span className="block pt-1 text-2xs font-medium text-foreground">{template.name}</span>
            </button>
          ))}
        </div>
      </GreetingCollapsible>
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
