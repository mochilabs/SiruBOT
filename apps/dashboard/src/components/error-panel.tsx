"use client";

import { AlertTriangle } from "lucide-react";

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
    <div className={`glass-panel p-12 text-center border-rose-500/20 shadow-xl max-w-xl mx-auto ${className}`}>
      <div className="mx-auto mb-6 inline-flex rounded-2xl bg-rose-500/10 p-4 border border-rose-500/20">
        <AlertTriangle className="h-8 w-8 text-rose-400" />
      </div>
      <h3 className="text-2xl font-black tracking-tighter text-foreground mb-4">
        {title}
      </h3>
      <p className="text-lg font-medium text-muted-foreground leading-relaxed">
        {message}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-8 px-6 py-2.5 rounded-full bg-primary/10 hover:bg-primary/20 text-primary font-bold transition-colors"
        >
          다시 시도하기
        </button>
      )}
    </div>
  );
}
