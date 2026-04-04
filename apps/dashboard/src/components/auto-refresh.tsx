"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function AutoRefresh({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [countdown, setCountdown] = useState(intervalMs / 1000);

  useEffect(() => {
    const refreshTimer = setInterval(() => {
      router.refresh();
      setLastRefresh(new Date());
      setCountdown(intervalMs / 1000);
    }, intervalMs);

    const countdownTimer = setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => {
      clearInterval(refreshTimer);
      clearInterval(countdownTimer);
    };
  }, [router, intervalMs]);

  return (
    <div className="flex items-center gap-4 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-card)] px-4 py-2 text-xs">
      <div className="flex items-center gap-2 text-[var(--color-text-secondary)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)] animate-pulse" />
        <span>
          자동 갱신:{" "}
          <span className="tabular-nums font-medium text-[var(--color-text-primary)]">
            {countdown}초
          </span>
        </span>
      </div>
      <div className="h-3 w-px bg-[var(--color-border)]" />
      <span className="text-[var(--color-text-muted)]">
        {lastRefresh.toLocaleTimeString("ko-KR")}
      </span>
    </div>
  );
}
