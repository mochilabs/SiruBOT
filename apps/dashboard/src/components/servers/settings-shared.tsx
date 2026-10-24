"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertCircle, Check, LogIn, Save, X } from "lucide-react";

import { Portal } from "@/components/overlay/portal";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-primary/15 text-primary-text">
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

/** 경고 박스 안 쓰는 공용 재시도 링크 — 모든 설정 패널이 같은 형태로 다시 시도해요 */
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

/** 채널 목록 로드 실패 공용 안내 — useGuildChannels를 쓰는 설정 패널이 같이 써요 */
export function ChannelListError({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  return (
    <WarningBox>
      채널 목록을 불러오지 못했어요. ({error.message}){" "}
      <RetryLink onRetry={onRetry} />
    </WarningBox>
  );
}

/**
 * 설정 패널 로딩 중 — 라우트 loading.tsx와 같은 모양(PanelHeader 아이콘+제목, 2단 필드 그리드)이에요.
 * 스켈레톤이 실제 패널과 자리를 공유해야 탭 전환·최초 진입에서 이중 레이아웃 시프트가 없어요.
 */
export function PanelLoading({ label }: { label: string }) {
  return (
    <Card padding="lg" role="status" aria-label={label}>
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

/** 모드 선택 카드(radiogroup): AI 설정·채팅 유틸 패널이 같은 마크업을 써요 */
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
          <RetryLink onRetry={onRetry} />
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

const dirtySaveBars = new Map<string, { dirty: boolean; active: boolean }>();
export const SettingsPanelActive = createContext(true);

export function hasUnsavedSettings(): boolean {
  return [...dirtySaveBars.values()].some((entry) => entry.dirty);
}

export function hasUnsavedActiveSettings(): boolean {
  return [...dirtySaveBars.values()].some((entry) => entry.dirty && entry.active);
}

const nudgeListeners = new Set<() => void>();

/** 저장하지 않은 채 떠나려 할 때 모달 없이 저장 바를 흔들어 주의를 끌어요 */
export function nudgeSaveBar() {
  nudgeListeners.forEach((notify) => notify());
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
  // 섬의 좌표는 화면에 고정된 앵커에서 읽어요. 높이는 여기 넣지 않아요.
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

  const handleSave = async () => {
    if (saving || savingRef.current) return;
    savingRef.current = true;
    setSubmitting(true);
    try { await onSave(); }
    finally { savingRef.current = false; setSubmitting(false); }
  };

  useEffect(() => {
    dirtySaveBars.set(id, { dirty: dirty || saving || submitting, active });
    return () => {
      dirtySaveBars.delete(id);
    };
  }, [dirty, saving, submitting, active, id]);

  // 탭 전환 시도 등에서 nudgeSaveBar()가 오면 섬을 흔들어 저장이 덜 된 걸 알려줘요
  useEffect(() => {
    const notify = () => {
      const island = islandRef.current;
      if (!visible || !island || typeof island.animate !== "function") return;
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
      island.animate(
        [
          { transform: "translateX(0px)" },
          { transform: "translateX(-6px)", offset: 0.2 },
          { transform: "translateX(5px)", offset: 0.4 },
          { transform: "translateX(-4px)", offset: 0.6 },
          { transform: "translateX(3px)", offset: 0.8 },
          { transform: "translateX(0px)" },
        ],
        { duration: 480, easing: "ease-in-out" }
      );
    };
    nudgeListeners.add(notify);
    return () => {
      nudgeListeners.delete(notify);
    };
  }, [visible]);

  return (
    <div ref={anchorRef} data-slot="settings-save-island-anchor">
      {visible && <Portal>
        <div ref={setIslandRef} data-slot="settings-save-island"
          onFocusCapture={() => { islandHadFocusRef.current = true; }}
          onBlurCapture={(event) => {
            if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) islandHadFocusRef.current = false;
          }}
          className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-4 right-4 z-(--z-savebar) flex flex-col gap-2.5 rounded-card bg-surface-3 px-4 py-2.5 text-foreground shadow-lg animate-in fade-in-0 slide-in-from-bottom-2 duration-fast md:bottom-[calc(0.75rem+env(safe-area-inset-bottom))] md:left-[var(--island-left)] md:right-auto md:w-[var(--island-width)] md:flex-row md:items-center md:justify-between"
          style={{ "--island-left": `${geometry.left}px`, "--island-width": `${geometry.width}px` } as React.CSSProperties}>
          <p role="status" className="min-w-0 text-sm font-medium">
            {saving || submitting ? "변경 사항을 저장하고 있어요…" : "저장하지 않은 변경 사항이 있어요!"}
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
