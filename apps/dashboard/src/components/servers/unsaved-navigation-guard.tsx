"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { hasUnsavedSettings, saveActiveSettings } from "./settings-shared";

/**
 * 클릭이 같은 사이트 안의 다른 페이지로 가는 링크인지 확인해요. 새 탭·다운로드·같은 페이지 이동은 제외해요.
 * App Router에는 라우트 변경 이벤트가 없어서, 모든 `next/link`가 결국 렌더하는 `<a>` 클릭을 캡처 단계에서 잡아요.
 */
export function internalNavigationTarget(event: MouseEvent, current: Location): string | null {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const anchor = event.target instanceof Element ? event.target.closest("a") : null;
  if (!anchor || !anchor.href) return null;
  if (anchor.hasAttribute("download")) return null;
  if (anchor.target && anchor.target !== "_self") return null;
  const url = new URL(anchor.href, current.href);
  if (url.origin !== current.origin) return null;
  // 같은 페이지 안의 쿼리·해시 이동(탭 전환 등)은 대시보드 셸이 따로 지켜요
  if (url.pathname === current.pathname) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * 저장하지 않은 설정이 있을 때 앱 안의 다른 페이지(내비게이션 바·푸터 링크 등)로 가는 이동을 막고 확인을 받아요.
 * 새로고침·탭 닫기는 settings-shared의 `beforeunload`가, 탭 전환·서버 전환은 각 컴포넌트가 이미 지켜요.
 */
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
      // 캡처 단계에서 끊어 Link의 클라이언트 이동이 시작되지 않게 해요
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
      // 저장 실패는 각 패널이 토스트로 알렸어요 — 이동하지 않고 편집 상태를 유지해요
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
