"use client";

import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ErrorPanelProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

/**
 * 오류 안내 — 로그인·404·초대 페이지와 같은 좌측 정렬 한 칼럼이에요(카드·아이콘 칩 없음).
 * 제목은 h2 헤딩 의미론을 유지해요 — error boundary에 다른 페이지 헤딩이 없을 때 스크린리더 헤딩 탐색으로 접근할 수 있어야 해요.
 */
export function ErrorPanel({
  title = "앗, 문제가 발생했어요",
  message = "데이터를 불러오지 못했어요.",
  onRetry,
  className
}: ErrorPanelProps) {
  return (
    <div className={cn("flex max-w-2xl flex-col items-start gap-6", className)}>
      <div className="space-y-3">
        <h2 className="break-keep text-3xl font-black tracking-tighter text-foreground sm:text-4xl">{title}</h2>
        <p className="max-w-md break-keep text-base font-medium leading-relaxed text-muted-foreground sm:text-lg">{message}</p>
      </div>
      {onRetry && (
        <Button variant="cta" className="h-11 gap-2 px-6 text-base font-bold" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" aria-hidden />
          다시 시도하기
        </Button>
      )}
    </div>
  );
}
