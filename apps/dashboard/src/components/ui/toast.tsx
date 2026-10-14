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

const toast = Object.assign(toastManager, {
  success: (message: string, description?: string) => toastManager.add({ type: "success", title: message, description }),
  error: (message: string, description?: string) => toastManager.add({ type: "error", title: message, description }),
  warning: (message: string, description?: string) => toastManager.add({ type: "warning", title: message, description }),
  info: (message: string, description?: string) => toastManager.add({ type: "info", title: message, description }),
})

type LucideIcon = React.ComponentType<{ className?: string }>

const variantConfig: Record<
  ToastVariant,
  {
    icon: LucideIcon
    iconColor: string
    iconBg: string
  }
> = {
  success: { icon: CircleCheckIcon, iconColor: "text-success", iconBg: "bg-success/10" },
  error: { icon: OctagonXIcon, iconColor: "text-destructive", iconBg: "bg-destructive/10" },
  warning: { icon: TriangleAlertIcon, iconColor: "text-warning", iconBg: "bg-warning/10" },
  info: { icon: InfoIcon, iconColor: "text-info", iconBg: "bg-info/10" },
}

function ToastPortal({ ...props }: ToastPrimitive.Portal.Props) {
  return <ToastPrimitive.Portal data-slot="toast-portal" {...props} />
}

function ToastViewport({ className, ...props }: ToastPrimitive.Viewport.Props) {
  return (
    <ToastPrimitive.Viewport
      data-slot="toast-viewport"
      className={cn(
        "pointer-events-none fixed inset-x-4 top-20 z-50 mx-auto w-auto max-w-sm outline-none sm:right-4 sm:left-auto sm:mx-0 sm:w-full",
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
        "group/toast pointer-events-auto relative mb-3 w-full rounded-card border-0 bg-popover text-popover-foreground shadow-lg outline-none select-none focus-visible:ring-2 focus-visible:ring-ring",
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
        "flex items-start gap-3 p-4",
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
      className={cn("text-sm font-semibold text-foreground", className)}
      {...props}
    />
  )
}

function ToastDescription({ className, ...props }: ToastPrimitive.Description.Props) {
  return (
    <ToastPrimitive.Description
      data-slot="toast-description"
      className={cn("text-sm text-muted-foreground", className)}
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
  render = <Button variant="ghost" size="icon-sm" />,
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
        "flex size-8 shrink-0 items-center justify-center rounded-full",
        iconBg,
        iconColor
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
    </span>
  )
}

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager()

  return toasts.map((toastItem) => (
    <Toast key={toastItem.id} toast={toastItem}>
      <ToastContent className="h-auto break-words rounded-card">
        <ToastIcon type={toastItem.type} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <ToastTitle />
          <ToastDescription />
        </div>
        {toastItem.actionProps && <ToastAction />}
        <ToastClose />
      </ToastContent>
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
