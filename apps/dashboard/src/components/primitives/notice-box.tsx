import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface NoticeBoxProps {
  children: ReactNode;
  variant?: "info" | "warning";
  className?: string;
}

export function NoticeBox({ children, variant = "info", className }: NoticeBoxProps) {
  return (
    <div
      role={variant === "warning" ? "alert" : undefined}
      className={cn(
        "rounded-menu px-4 py-3 text-sm break-words space-y-1",
        variant === "info" && "bg-muted/20 text-muted-foreground",
        variant === "warning" && "border border-warning/30 bg-warning/5 text-warning",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function InfoBox({ children, className }: { children: ReactNode; className?: string }) {
  return <NoticeBox variant="info" className={className}>{children}</NoticeBox>;
}

export function WarningBox({ children, className }: { children: ReactNode; className?: string }) {
  return <NoticeBox variant="warning" className={className}>{children}</NoticeBox>;
}
