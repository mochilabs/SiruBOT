"use client";

import { RefreshCw } from "lucide-react";

import { ErrorRoom } from "@/components/error-room";
import { StatusScreen } from "@/components/status-screen";
import { Button } from "@/components/ui/button";

interface ErrorPanelProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

/** 페이지 본문 안에 들어가는 오류 안내 — 라우트 오류 화면과 같은 2단 구성(StatusScreen inline)이에요 */
export function ErrorPanel({
  title = "앗, 문제가 발생했어요",
  message = "데이터를 불러오지 못했어요.",
  onRetry,
  className
}: ErrorPanelProps) {
  return (
    <StatusScreen
      inline
      className={className}
      title={title}
      description={message}
      illustration={<ErrorRoom className="block h-auto w-full" />}
      actions={
        onRetry && (
          <Button variant="cta" className="h-11 gap-2.5 px-8 text-base font-bold" onClick={onRetry}>
            <RefreshCw className="h-5 w-5" aria-hidden />
            다시 시도하기
          </Button>
        )
      }
    />
  );
}
