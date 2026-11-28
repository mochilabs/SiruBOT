"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertCircle, Check, ChevronsUpDown, LogIn, X } from "lucide-react";

import { Portal } from "@/components/overlay/portal";
import { InfoBox, WarningBox } from "@/components/primitives/notice-box";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ApiError } from "@/lib/api-error";
import { cn } from "@/lib/utils";

import { useFeatureSwitcher, useRegisterPanelHeader } from "./feature-switcher";

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
  const switcher = useFeatureSwitcher();
  const headerRef = useRef<HTMLElement>(null);
  useRegisterPanelHeader(headerRef);

  return (
    <header ref={headerRef} className="flex flex-col items-start justify-between gap-4 sm:flex-row">
      <div className="flex min-w-0 items-start gap-3.5">
        <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-row sm:inline-flex bg-primary/20 text-primary-text">
          {icon}
        </span>
        <div className="min-w-0 break-words">
          {switcher && (
            <h2 className="text-xl font-extrabold tracking-tight text-foreground lg:hidden">
              <button
                type="button"
                onClick={() => switcher.setOpen(true)}
                aria-label={`기능 바꾸기, 현재 ${title}`}
                className="-mx-2 inline-flex items-center gap-1.5 rounded-menu px-2 py-0.5 text-left transition-control hover:bg-accent/15 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span aria-hidden className="shrink-0 text-primary-text sm:hidden">
                  {icon}
                </span>
                {title}
                <ChevronsUpDown size={14} aria-hidden className="shrink-0 text-muted-foreground" />
              </button>
            </h2>
          )}
          <h2 className={cn("text-2xl font-extrabold tracking-tight text-foreground", switcher && "hidden lg:block")}>{title}</h2>
          <p className="hidden text-sm font-medium text-muted-foreground/90 sm:block">{description}</p>
        </div>
      </div>
      {action && <div className="flex max-w-full flex-wrap gap-2 sm:shrink-0">{action}</div>}
    </header>
  );
}

export { InfoBox, WarningBox };

export function RetryLink({ onRetry, className }: { onRetry: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onRetry}
      className={cn(buttonVariants({ variant: "link" }), "font-semibold", className)}
    >
      다시 시도
    </button>
  );
}

export function ChannelListError({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  return (
    <WarningBox>
      채널 목록을 불러오지 못했어요. ({error.message}){" "}
      <RetryLink onRetry={onRetry} />
    </WarningBox>
  );
}

export function PanelLoading({ label, decorative = false }: { label: string; decorative?: boolean }) {
  return (
    <Card padding="lg" {...(decorative ? { "aria-hidden": true } : { role: "status", "aria-label": label })}>
      <div className="space-y-6">
        <div className="flex items-start gap-3">
          <Skeleton className="h-10 w-10 shrink-0 rounded-control" />
          <div className="min-w-0 space-y-1.5">
            <Skeleton.Line width="9rem" height="h-5" />
            <Skeleton.Line width="16rem" height="h-4" />
          </div>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          {[0, 1, 2, 3].map((field) => (
            <div key={field} className="space-y-2">
              <Skeleton.Line width="5rem" height="h-4" />
              <Skeleton.Line width="100%" height="h-9" />
              <Skeleton.Line width="65%" height="h-3.5" />
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

export interface ModeCardOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
  icon: ReactNode;
}

export function ModePicker<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly ModeCardOption<T>[];
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-3 sm:grid-cols-3">
      {options.map((card) => {
        const active = value === card.value;
        return (
          <button
            key={card.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(card.value)}
            className={`relative rounded-card p-4 text-left transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              active ? "bg-primary/10 ring-2 ring-ring" : "bg-surface-2 hover:bg-surface-3"
            }`}
          >
            <span className="flex items-center gap-2 text-sm font-bold text-foreground">
              <span className={active ? "text-primary-text" : "text-muted-foreground"}>{card.icon}</span>
              {card.label}
            </span>
            {card.description && <span className="mt-1 block text-xs text-muted-foreground">{card.description}</span>}
            {active && (
              <span className="absolute right-3 top-3 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-control text-primary-control-text">
                <Check size={12} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

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
      return (
        <p className="text-xs text-muted-foreground">
          {error.message}{" "}
          <RetryLink onRetry={onRetry} />
        </p>
      );
    }

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
          <RetryLink onRetry={onRetry} />
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

  return (
    <Card padding="lg" className="gap-3">
      <p className="flex items-center gap-2 text-sm text-destructive">
        <AlertCircle size={16} aria-hidden />
        {error.message}
      </p>
    </Card>
  );
}

type SaveResult = boolean | void;

const dirtySaveBars = new Map<string, { dirty: boolean; active: boolean; save: () => Promise<SaveResult> }>();

const saveBarListeners = new Set<() => void>();

let beforeUnloadBound = false;
function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (hasUnsavedSettings()) {
    event.preventDefault();
  }
}

function syncBeforeUnloadListener() {
  if (typeof window === "undefined") return;
  const shouldBind = hasUnsavedSettings();
  if (shouldBind && !beforeUnloadBound) {
    window.addEventListener("beforeunload", handleBeforeUnload);
    beforeUnloadBound = true;
  } else if (!shouldBind && beforeUnloadBound) {
    window.removeEventListener("beforeunload", handleBeforeUnload);
    beforeUnloadBound = false;
  }
}

function notifySaveBarListeners() {
  syncBeforeUnloadListener();
  saveBarListeners.forEach((fn) => fn());
}

export const SettingsPanelActive = createContext(true);

export function hasUnsavedSettings(): boolean {
  return [...dirtySaveBars.values()].some((entry) => entry.dirty);
}

export function hasUnsavedActiveSettings(): boolean {
  return [...dirtySaveBars.values()].some((entry) => entry.dirty && entry.active);
}

export async function saveActiveSettings(): Promise<boolean> {
  const entries = [...dirtySaveBars.values()].filter((entry) => entry.dirty && entry.active);
  const results = await Promise.all(entries.map((entry) => entry.save()));
  if (results.some((result) => result === false)) return false;
  if (results.every((result) => result === true)) return true;
  await new Promise((resolve) => setTimeout(resolve, 60));
  return !hasUnsavedActiveSettings();
}

export function useHasUnsavedActiveSettings(): boolean {
  const [hasUnsaved, setHasUnsaved] = useState(() => hasUnsavedActiveSettings());

  useEffect(() => {
    const listener = () => setHasUnsaved(hasUnsavedActiveSettings());
    saveBarListeners.add(listener);
    listener();
    return () => {
      saveBarListeners.delete(listener);
    };
  }, []);

  return hasUnsaved;
}

let discardHandler: (() => void) | null = null;

export function registerSettingsDiscardHandler(handler: () => void): () => void {
  discardHandler = handler;
  return () => {
    if (discardHandler === handler) discardHandler = null;
  };
}

export function SaveBar({
  dirty,
  saving,
  onSave,
  onDiscard,
  children,
  active: activeProp,
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => SaveResult | Promise<SaveResult>;
  onDiscard?: () => void;
  children?: ReactNode;
  active?: boolean;
}) {
  const id = useId();
  const panelActive = useContext(SettingsPanelActive);
  const active = activeProp ?? panelActive;
  const anchorRef = useRef<HTMLDivElement>(null);
  const islandRef = useRef<HTMLDivElement>(null);
  const islandHadFocusRef = useRef(false);
  const setIslandRef = useCallback((node: HTMLDivElement | null) => {
    if (!node && islandHadFocusRef.current) {
      const heading = anchorRef.current?.parentElement?.querySelector<HTMLElement>("h2");
      if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
      islandHadFocusRef.current = false;
    }
    islandRef.current = node;
  }, []);
  const savingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  // 섬은 fixed라 본문을 밀지 않고, 앵커에 높이를 예약하면 설정 패널이 갑자기 커져요.
  const [geometry, setGeometry] = useState({ left: 16, width: 0 });
  const visible = active && (dirty || saving || submitting);

  useLayoutEffect(() => {
    if (!visible) return;
    const update = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const available = Math.max(0, Math.min(rect.width, window.innerWidth - Math.max(16, rect.left) - 16));
      const width = Math.min(available, 760);
      const left = Math.max(16, rect.left) + (available - width) / 2;
      setGeometry((previous) => previous.left === left && previous.width === width ? previous : { left, width });
    };
    update();
    const observer = new ResizeObserver(update);
    if (anchorRef.current) observer.observe(anchorRef.current);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [visible]);

  const handleSave = async (): Promise<SaveResult> => {
    if (saving || savingRef.current) return false;
    savingRef.current = true;
    setSubmitting(true);
    try { return await onSave(); }
    finally { savingRef.current = false; setSubmitting(false); }
  };

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  useEffect(() => {
    dirtySaveBars.set(id, { dirty: dirty || saving || submitting, active, save: () => handleSaveRef.current() });
    notifySaveBarListeners();
    return () => {
      dirtySaveBars.delete(id);
      notifySaveBarListeners();
    };
  }, [dirty, saving, submitting, active, id]);

  return (
    <div ref={anchorRef} data-slot="settings-save-island-anchor" aria-hidden className="pointer-events-none absolute inset-x-6 bottom-0 h-0">
      {visible && <Portal>
        <div ref={setIslandRef} data-slot="settings-save-island"
          onFocusCapture={() => { islandHadFocusRef.current = true; }}
          onBlurCapture={(event) => {
            if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) islandHadFocusRef.current = false;
          }}
          className="fixed bottom-[calc(max(var(--tabbar-h),0.75rem)+0.25rem+env(safe-area-inset-bottom))] left-4 right-4 z-(--z-savebar) flex items-center justify-between gap-3 rounded-card bg-surface-3 py-2 pl-4 pr-2 text-foreground shadow-lg animate-in fade-in-0 slide-in-from-bottom-2 duration-fast md:bottom-[calc(0.75rem+env(safe-area-inset-bottom))] md:left-[var(--island-left)] md:right-auto md:w-[var(--island-width)]"
          style={{ "--island-left": `${geometry.left}px`, "--island-width": `${geometry.width}px` } as React.CSSProperties}>
          <p role="status" className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground sm:text-sm">
            {saving || submitting ? "변경 사항을 저장하고 있어요…" : "저장하지 않은 변경 사항이 있어요!"}
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            {children}
            {(onDiscard || discardHandler) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3"
                disabled={saving || submitting}
                onClick={() => (onDiscard ?? discardHandler)?.()}
              >
                취소
              </Button>
            )}
            <Button
              variant="cta"
              size="sm"
              className="h-8 px-3.5"
              loading={saving || submitting}
              disabled={!dirty}
              onClick={() => void handleSave()}
            >
              <span className="sm:hidden">저장</span>
              <span className="hidden sm:inline">{saving || submitting ? "저장 중…" : "변경 사항 저장"}</span>
            </Button>
          </div>
        </div>
      </Portal>}
    </div>
  );
}
