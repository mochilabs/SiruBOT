"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { hasUnsavedSettings, saveActiveSettings } from "./settings-shared";

/** App Router에는 라우트 변경 이벤트가 없어 `next/link`의 `<a>` 클릭을 캡처 단계에서 잡는다. */
export function internalNavigationTarget(event: MouseEvent, current: Location): string | null {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const anchor = event.target instanceof Element ? event.target.closest("a") : null;
  if (!anchor || !anchor.href) return null;
  if (anchor.hasAttribute("download")) return null;
  if (anchor.target && anchor.target !== "_self") return null;
  const url = new URL(anchor.href, current.href);
  if (url.origin !== current.origin) return null;
  if (url.pathname === current.pathname) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

export function UnsavedNavigationGuard() {
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pendingRef = useRef<string | null>(null);
  pendingRef.current = pendingHref;

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!hasUnsavedSettings()) return;
      const href = internalNavigationTarget(event, window.location);
      if (!href) return;
      event.preventDefault();
      event.stopPropagation();
      setPendingHref(href);
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  const leave = () => {
    const href = pendingRef.current;
    setPendingHref(null);
    if (href) router.push(href);
  };
  const saveAndLeave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (await saveActiveSettings()) leave();
      else setPendingHref(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={pendingHref !== null} onOpenChange={(open) => { if (!open && !saving) setPendingHref(null); }}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>저장하지 않은 변경 사항이 있어요</DialogTitle>
          <DialogDescription>다른 페이지로 이동하기 전에 변경 사항을 저장할지 선택해 주세요.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" className="min-h-11" disabled={saving} onClick={() => setPendingHref(null)}>
            계속 편집
          </Button>
          <Button variant="secondary" className="min-h-11" disabled={saving} onClick={leave}>
            저장하지 않고 이동
          </Button>
          <Button variant="cta" className="min-h-11" loading={saving} onClick={() => void saveAndLeave()}>
            저장하고 이동
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
