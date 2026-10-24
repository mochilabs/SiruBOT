"use client";

import { AlertTriangle } from "lucide-react";

import { EmptyState } from "@/components/primitives/empty-state";
import { Button } from "@/components/ui/button";

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
  // EmptyState tone="destructive" 위임 — 형태 언어를 EmptyState와 공유하되 max-w-xl 중앙 배치만 유지(P1)
  return (
    <EmptyState
      icon={AlertTriangle}
      tone="destructive"
      title={title}
      description={message}
      action={
        onRetry ? (
          <Button variant="secondary" onClick={onRetry}>
            다시 시도하기
          </Button>
        ) : undefined
      }
      className={`max-w-xl mx-auto p-12 ${className}`}
    />
  );
}