import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface NoticeBoxProps {
  children: ReactNode;
  variant?: "info" | "warning";
  className?: string;
}

/**
 * 안내 및 경고 박스 공용 프리미티브
 * - info: 토큰 기반 은은한 안내 박스 (bg-muted/20, text-muted-foreground)
 * - warning: 비텍스트 3:1 경계 및 상태 색상을 준수하는 경고 박스 (bg-warning/5, border-warning/30, text-warning)
 */
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

/** 토큰 기반 안내 박스 단축 컴포넌트 */
export function InfoBox({ children, className }: { children: ReactNode; className?: string }) {
  return <NoticeBox variant="info" className={className}>{children}</NoticeBox>;
}

/** 경고 박스 단축 컴포넌트 (상태 색상: warning) */
export function WarningBox({ children, className }: { children: ReactNode; className?: string }) {
  return <NoticeBox variant="warning" className={className}>{children}</NoticeBox>;
}
