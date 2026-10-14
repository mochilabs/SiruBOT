"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertCircle, Loader2, LogIn, Save, X } from "lucide-react";

import { Portal } from "@/components/overlay/portal";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ApiError } from "@/lib/api-error";
import { cn } from "@/lib/utils";

export function PanelHeader({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col items-start justify-between gap-4 sm:flex-row">
      <div className="flex min-w-0 items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary-text">
          {icon}
        </span>
        <div className="min-w-0 break-words">
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {action && <div className="flex max-w-full flex-wrap gap-2 sm:shrink-0">{action}</div>}
    </header>
  );
}

/** 토큰 기반 안내 박스 */
export function InfoBox({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-menu bg-muted/20 px-4 py-3 text-sm text-muted-foreground space-y-1 break-words">
      {children}
    </div>
  );
}

/** 경고 박스 (상태 색상 관례: amber) */
export function WarningBox({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-menu border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning break-words">
      {children}
    </div>
  );
}

export function PanelLoading({ label }: { label: string }) {
  return (
    <Card
      padding="lg"
      className="flex items-center gap-3 text-muted-foreground text-sm"
      role="status"
    >
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </Card>
  );
}

/** 닫은 일시 장애 안내 기록 키 — 같은 페이지(같은 길드)·같은 상태 코드 단위로 세션 동안 유지돼요 */
function noticeStorageKey(pathname: string, code: number): string {
  return `siru:error-note:${pathname}:${code}`;
}

function readNoticeDismissed(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeNoticeDismissed(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    // 스토리지 차단 시 닫기가 세션에만 유지되지 않아요 — 기본 동작으로 계속해요
  }
}

export function PanelError({
  error,
  onRetry,
}: {
  error: ApiError;
  onRetry: () => void;
}) {
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState(false);
  const storageKey = noticeStorageKey(pathname, error.status ?? 0);

  useEffect(() => {
    setDismissed(readNoticeDismissed(storageKey));
  }, [storageKey]);

  if (error.status === 401) {
    // 세션 만료 — 재시도 대신 로그인 페이지로 안내해요
    return (
      <Card padding="lg" className="gap-3">
        <p className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle size={16} aria-hidden />
          {error.message}
        </p>
        <Link
          href={`/api/auth/signin?callbackUrl=${encodeURIComponent(pathname)}`}
          className={cn(
            buttonVariants({ variant: "primary", size: "sm" }),
            "w-fit",
          )}
        >
          <LogIn size={14} aria-hidden />
          다시 로그인
        </Link>
      </Card>
    );
  }

  const handleDismiss = () => {
    writeNoticeDismissed(storageKey);
    setDismissed(true);
  };

  if (error.retryable) {
    if (dismissed) {
      // 닫은 뒤에도 상태는 조용하게 남겨요 — 원인과 다음 행동을 숨기지 않아요
      return (
        <p className="text-xs text-muted-foreground">
          {error.message}{" "}
          <button
            type="button"
            className="font-semibold underline underline-offset-2"
            onClick={onRetry}
          >
            다시 시도
          </button>
        </p>
      );
    }

    // Discord 일시 장애 등 재시도 가능한 오류 — 화면을 가리는 배너 대신 닫을 수 있는 인라인 안내
    return (
      <div
        role="status"
        className="flex items-start gap-3 rounded-control border border-warning/30 bg-warning/5 px-4 py-3"
      >
        <div className="min-w-0 flex-1 space-y-1 text-xs text-warning">
          <p className="flex items-center gap-1.5">
            <AlertCircle size={14} aria-hidden className="shrink-0" />
            {error.message}
          </p>
          <button
            type="button"
            className="font-semibold underline underline-offset-2"
            onClick={onRetry}
          >
            다시 시도
          </button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={<X size={14} aria-hidden />}
          onClick={handleDismiss}
          aria-label="오류 안내 닫기"
        />
      </div>
    );
  }

  // 권한 없음(403) 등 재시도로 해결되지 않는 안내 — 명확한 카드로 유지해요
  return (
    <Card padding="lg" className="gap-3">
      <p className="flex items-center gap-2 text-sm text-destructive">
        <AlertCircle size={16} aria-hidden />
        {error.message}
      </p>
    </Card>
  );
}

const dirtySaveBars = new Map<string, boolean>();
export const SettingsPanelActive = createContext(true);

export function hasUnsavedSettings(): boolean {
  return [...dirtySaveBars.values()].some(Boolean);
}

export function SaveBar({
  dirty,
  saving,
  onSave,
  children,
  active: activeProp,
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void | Promise<void>;
  children?: ReactNode;
  active?: boolean;
}) {
  const id = useId();
  const panelActive = useContext(SettingsPanelActive);
  const active = activeProp ?? panelActive;
  const anchorRef = useRef<HTMLDivElement>(null);
  const islandRef = useRef<HTMLDivElement>(null);
  const islandHadFocusRef = useRef(false);
  const [islandNode, setIslandNode] = useState<HTMLDivElement | null>(null);
  const setIslandRef = useCallback((node: HTMLDivElement | null) => {
    if (!node && islandHadFocusRef.current) {
      const heading = anchorRef.current?.parentElement?.querySelector<HTMLElement>("h2");
      if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
      islandHadFocusRef.current = false;
    }
    islandRef.current = node;
    setIslandNode(node);
  }, []);
  const savingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [geometry, setGeometry] = useState({ left: 16, width: 0, height: 0 });
  const visible = active && (dirty || saving || submitting);

  useLayoutEffect(() => {
    if (!visible) return;
    const update = () => {
      const anchor = anchorRef.current;
      const island = islandRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const available = Math.max(0, Math.min(rect.width, window.innerWidth - Math.max(16, rect.left) - 16));
      const width = Math.min(available, 760);
      const left = Math.max(16, rect.left) + (available - width) / 2;
      const height = island?.getBoundingClientRect().height ?? 0;
      setGeometry((previous) => previous.left === left && previous.width === width && previous.height === height
        ? previous : { left, width, height });
    };
    update();
    const observer = new ResizeObserver(update);
    if (anchorRef.current) observer.observe(anchorRef.current);
    if (islandRef.current) observer.observe(islandRef.current);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [visible]);

  useEffect(() => {
    if (!visible || !islandNode) return;
    const island = islandNode;
    const observer = new ResizeObserver(() => {
      const height = island.getBoundingClientRect().height;
      setGeometry((value) => value.height === height ? value : { ...value, height });
    });
    observer.observe(island);
    const height = island.getBoundingClientRect().height;
    setGeometry((value) => value.height === height ? value : { ...value, height });
    return () => observer.disconnect();
  }, [visible, islandNode]);

  const handleSave = async () => {
    if (saving || savingRef.current) return;
    savingRef.current = true;
    setSubmitting(true);
    try { await onSave(); }
    finally { savingRef.current = false; setSubmitting(false); }
  };

  useEffect(() => {
    dirtySaveBars.set(id, dirty || saving || submitting);
    return () => {
      dirtySaveBars.delete(id);
    };
  }, [dirty, saving, submitting, id]);

  return (
    <div ref={anchorRef} style={{ height: visible ? geometry.height + 36 : 0 }}>
      {visible && <Portal>
        <div ref={setIslandRef} data-slot="settings-save-island"
          onFocusCapture={() => { islandHadFocusRef.current = true; }}
          onBlurCapture={(event) => {
            if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) islandHadFocusRef.current = false;
          }}
          className="fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-4 right-4 z-30 flex flex-col gap-2.5 rounded-card bg-surface-3 px-4 py-2.5 text-foreground shadow-lg sm:left-[var(--island-left)] sm:right-auto sm:w-[var(--island-width)] sm:flex-row sm:items-center sm:justify-between"
          style={{ "--island-left": `${geometry.left}px`, "--island-width": `${geometry.width}px` } as React.CSSProperties}>
          <p role="status" className="min-w-0 text-sm font-medium">
            {saving || submitting ? "변경 사항을 저장하고 있어요…" : "저장하지 않은 변경 사항"}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {children}
      <Button
        variant="cta"
        size="sm"
        className="h-8 px-3.5"
        loading={saving || submitting}
        disabled={!dirty}
        icon={saving ? undefined : <Save size={15} />}
        onClick={handleSave}
      >
        {saving || submitting ? "저장 중…" : "변경 사항 저장"}
      </Button>
          </div>
        </div>
      </Portal>}
    </div>
  );
}
