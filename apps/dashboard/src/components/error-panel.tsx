"use client";

import { AlertTriangle } from "lucide-react";

import { toneStyles } from "@/components/primitives/badge";
import { Button } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";

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
  return (
    <Card padding="none" className={`p-12 text-center border-destructive/25 max-w-xl mx-auto ${className}`}>
      <div className={`mx-auto mb-6 inline-flex rounded-card border p-4 ${toneStyles.destructive.badge}`}>
        <AlertTriangle className="h-8 w-8" />
      </div>
      <h3 className="text-2xl font-semibold tracking-tight text-foreground mb-4">{title}</h3>
      <p className="text-lg font-medium text-muted-foreground leading-relaxed">{message}</p>
      {onRetry && (
        <div className="mt-8 flex justify-center">
          <Button variant="secondary" onClick={onRetry}>
            다시 시도하기
          </Button>
        </div>
      )}
    </Card>
  );
}
