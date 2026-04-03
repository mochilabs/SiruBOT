"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ErrorPage({
  error,
  reset,
}: {
  error: globalThis.Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="space-y-8">
        <div className="space-y-4">
          <h1 className="text-8xl font-extrabold text-[var(--color-error)]">
            !
          </h1>
          <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">
            오류가 발생했습니다
          </h2>
          <p className="text-[var(--color-text-secondary)] max-w-md">
            페이지를 로드하는 중 문제가 발생했습니다. 다시 시도해 주세요.
          </p>
          {process.env.NODE_ENV === "development" && (
            <pre className="mx-auto max-w-lg rounded-lg bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] p-4 text-left text-xs text-[var(--color-text-muted)] overflow-auto">
              {error.message}
            </pre>
          )}
        </div>
        <div className="flex items-center justify-center gap-4">
          <button type="button" onClick={reset} className="btn-accent">
            다시 시도
          </button>
          <Link href="/" className="btn-ghost">
            홈으로 가기
          </Link>
        </div>
      </div>
    </div>
  );
}
