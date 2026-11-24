"use client"

import * as React from "react"
import { Toast as ToastPrimitive } from "@base-ui/react/toast"
import { CircleCheckIcon, InfoIcon, OctagonXIcon, TriangleAlertIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ToastVariant = "success" | "error" | "warning" | "info"

/**
 * 앱 전체에서 단 하나뿐인 토스트 매니저 — root layout이 마운트하는 <Toaster />만 이걸 렌더해요.
 * Provider 내부 store가 이 매니저를 미러링하므로 어느 컴포넌트에서 추가해도 목적지는 하나예요.
 */
const toastManager = ToastPrimitive.createToastManager()

/** 토스트 자동 닫힘 시간(ms) — Base UI 기본값(5000)과 같고, 진행 막대 길이도 이 값을 따라요. */
const TOAST_TIMEOUT_MS = 5000

const toast = Object.assign(toastManager, {
  success: (message: string, description?: string) =>
    toastManager.add({ type: "success", title: message, description, timeout: TOAST_TIMEOUT_MS }),
  error: (message: string, description?: string) =>
    toastManager.add({ type: "error", title: message, description, timeout: TOAST_TIMEOUT_MS }),
  warning: (message: string, description?: string) =>
    toastManager.add({ type: "warning", title: message, description, timeout: TOAST_TIMEOUT_MS }),
  info: (message: string, description?: string) =>
    toastManager.add({ type: "info", title: message, description, timeout: TOAST_TIMEOUT_MS }),
})

type LucideIcon = React.ComponentType<{ className?: string }>

const variantConfig: Record<
  ToastVariant,
  {
    icon: LucideIcon
    iconColor: string
    iconBg: string
    barBg: string
  }
> = {
  success: { icon: CircleCheckIcon, iconColor: "text-success", iconBg: "bg-success/10", barBg: "bg-success" },
  error: { icon: OctagonXIcon, iconColor: "text-destructive", iconBg: "bg-destructive/10", barBg: "bg-destructive" },
  warning: { icon: TriangleAlertIcon, iconColor: "text-warning", iconBg: "bg-warning/10", barBg: "bg-warning" },
  info: { icon: InfoIcon, iconColor: "text-info", iconBg: "bg-info/10", barBg: "bg-info" },
}

function ToastPortal({ ...props }: ToastPrimitive.Portal.Props) {
  return <ToastPrimitive.Portal data-slot="toast-portal" {...props} />
}

function ToastViewport({ className, ...props }: ToastPrimitive.Viewport.Props) {
  return (
    <ToastPrimitive.Viewport
      data-slot="toast-viewport"
      // 모달류(dialog/sheet/dropdown 등)는 z-(--z-overlay)(=50), 토스트 알림은 항상 그 위 z-(--toast-z)(=100) — 모달이 열려 있어도 알림이 뒤로 가려지지 않게.
      // z-toast처럼 보이는 커스텀 이름은 v4 --z-* 네임스페이스가 없어 규칙이 안 만들어지므로 z-(--var) 문법을 써요.
      className={cn(
        "pointer-events-none fixed inset-x-4 bottom-24 z-(--toast-z) mx-auto w-auto max-w-xs sm:bottom-auto sm:top-20 sm:max-w-sm outline-none sm:right-4 sm:left-auto sm:mx-0 sm:w-full",
        className
      )}
      {...props}
    />
  )
}

function Toast({ className, ...props }: ToastPrimitive.Root.Props) {
  return (
    <ToastPrimitive.Root
      data-slot="toast"
      className={cn(
        "group/toast pointer-events-auto relative mb-2 w-full overflow-hidden rounded-card sm:mb-3 border-0 bg-popover text-popover-foreground shadow-lg outline-none select-none focus-visible:ring-2 focus-visible:ring-ring",
        "transition-[opacity,transform] duration-fast [transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--toast-swipe-movement-y))] data-starting-style:opacity-0 data-ending-style:opacity-0 data-limited:hidden",
        className
      )}
      {...props}
    />
  )
}

function ToastContent({ className, ...props }: ToastPrimitive.Content.Props) {
  return (
    <ToastPrimitive.Content
      data-slot="toast-content"
      className={cn(
        "flex items-center gap-2 px-3 py-2.5 sm:gap-3 sm:p-4",
        className
      )}
      {...props}
    />
  )
}

function ToastTitle({ className, ...props }: ToastPrimitive.Title.Props) {
  return (
    <ToastPrimitive.Title
      data-slot="toast-title"
      className={cn("text-xs font-semibold text-foreground sm:text-sm", className)}
      {...props}
    />
  )
}

function ToastDescription({ className, ...props }: ToastPrimitive.Description.Props) {
  return (
    <ToastPrimitive.Description
      data-slot="toast-description"
      className={cn("text-xs text-muted-foreground sm:text-sm", className)}
      {...props}
    />
  )
}

function ToastAction({
  className,
  render = <Button variant="outline" size="sm" />,
  ...props
}: ToastPrimitive.Action.Props) {
  return (
    <ToastPrimitive.Action
      data-slot="toast-action"
      render={render}
      className={cn("shrink-0", className)}
      {...props}
    />
  )
}

function ToastClose({
  className,
  children,
  render = <Button variant="ghost" size="icon-sm" className="size-6 sm:size-7" />,
  ...props
}: ToastPrimitive.Close.Props) {
  return (
    <ToastPrimitive.Close
      data-slot="toast-close"
      aria-label="닫기"
      render={render}
      className={cn(
        "relative shrink-0 text-muted-foreground after:absolute after:-inset-2 after:content-[''] hover:text-foreground",
        className
      )}
      {...props}
    >
      {children ?? <XIcon aria-hidden="true" />}
    </ToastPrimitive.Close>
  )
}

function ToastIcon({ type }: { type: string | undefined }) {
  const variant = type as ToastVariant | undefined
  if (!variant || !variantConfig[variant]) {
    return null
  }

  const { icon: Icon, iconColor, iconBg } = variantConfig[variant]

  return (
    <span
      data-slot="toast-icon"
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full sm:size-8",
        iconBg,
        iconColor
      )}
    >
      <Icon className="size-3.5 sm:size-4" aria-hidden="true" />
    </span>
  )
}

/** 자동 닫힘까지 남은 시간을 보여주는 막대 — 호버·포커스로 타이머가 멈추면(data-expanded) 같이 멈춰요. */
function ToastProgress({ type, timeout }: { type: string | undefined; timeout: number | undefined }) {
  const variant = type as ToastVariant | undefined
  const duration = timeout ?? TOAST_TIMEOUT_MS
  // timeout 0 = 자동으로 닫히지 않는 토스트라 막대가 없어요.
  if (duration <= 0) return null

  return (
    <span aria-hidden="true" data-slot="toast-progress" className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 motion-reduce:hidden sm:h-1">
      <span
        className={cn(
          "block h-full origin-left animate-toast-progress group-data-expanded/toast:[animation-play-state:paused]",
          variant && variantConfig[variant] ? variantConfig[variant].barBg : "bg-primary-control"
        )}
        style={{ "--toast-duration": `${duration}ms` } as React.CSSProperties}
      />
    </span>
  )
}

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager()

  return toasts.map((toastItem) => (
    <Toast key={toastItem.id} toast={toastItem}>
      <ToastContent
        className={cn(
          "h-auto break-words rounded-card",
          toastItem.description ? "items-start" : "items-center"
        )}
      >
        <ToastIcon type={toastItem.type} />
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
          <ToastTitle className="leading-snug" />
          {toastItem.description && <ToastDescription className="leading-snug" />}
        </div>
        {toastItem.actionProps && <ToastAction />}
        <ToastClose />
      </ToastContent>
      <ToastProgress type={toastItem.type} timeout={toastItem.timeout} />
    </Toast>
  ))
}

/** root layout에서 한 번만 마운트해요. 페이지마다 두면 같은 매니저 토스트가 두 번 렌더돼요. */
function Toaster({ children, ...props }: ToastPrimitive.Provider.Props) {
  return (
    <ToastPrimitive.Provider toastManager={toastManager} {...props}>
      {children}
      <ToastPortal>
        <ToastViewport>
          <ToastList />
        </ToastViewport>
      </ToastPortal>
    </ToastPrimitive.Provider>
  )
}

/**
 * 컨텍스트 훅 대신 단일 모듈 매니저 상수를 돌려줘요.
 * 참조가 영원히 불변이라 toast를 useEffect deps에 넣어도 토스트 방송마다 이펙트가 다시 돌지 않아요.
 */
function useToast() {
  return toast
}

export { toast, Toaster, useToast }
export type { ToastVariant }
