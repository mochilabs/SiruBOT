"use client";

import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface ErrorPanelProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorPanel({
  title = "앗, 문제가 발생했어요",
  message = "데이터를 불러오지 못했어요.",
  onRetry,
  className = ""
}: ErrorPanelProps) {
  // EmptyState와 같은 형태 언어: rounded 컨테이너 + rounded-menu 아이콘 칩 + sm 타이포 + secondary 재시도
  return (
    <Card padding="none" className={`flex flex-col items-center justify-center gap-3 p-12 text-center max-w-xl mx-auto ${className}`}>
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-menu bg-destructive/10 text-destructive">
        <AlertTriangle className="h-5 w-5" aria-hidden />
      </span>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          <Button variant="secondary" onClick={onRetry}>
            다시 시도하기
          </Button>
        </div>
      )}
    </Card>
  );
}
