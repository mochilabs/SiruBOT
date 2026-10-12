"use client"

import { useTheme } from "next-themes"
import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon, XIcon } from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
        close: (
          <XIcon className="size-4" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "transparent",
          "--normal-shadow": "var(--elev-5)",
          "--success-bg": "var(--success)",
          "--success-text": "var(--success-foreground)",
          "--success-border": "transparent",
          "--success-shadow": "var(--elev-5)",
          "--error-bg": "var(--destructive)",
          "--error-text": "var(--destructive-foreground)",
          "--error-border": "transparent",
          "--error-shadow": "var(--elev-5)",
          "--warning-bg": "var(--warning)",
          "--warning-text": "var(--warning-foreground)",
          "--warning-border": "transparent",
          "--warning-shadow": "var(--elev-5)",
          "--info-bg": "var(--info)",
          "--info-text": "var(--info-foreground)",
          "--info-border": "transparent",
          "--info-shadow": "var(--elev-5)",
          "--border-radius": "var(--r-card)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "group border-0 rounded-card bg-popover text-popover-foreground shadow-2xl",
          description: "text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
