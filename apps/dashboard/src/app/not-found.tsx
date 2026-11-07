"use client";

import Link from "next/link";
import { ChevronLeft, Home } from "lucide-react";

import { NotFoundRoom } from "@/components/not-found-room";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-[calc(100svh-var(--navbar-h))] w-full max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
      <div className="flex flex-col items-start gap-8">
        <div className="space-y-3">
          <h1 className="break-keep text-4xl font-black tracking-tighter text-foreground sm:text-5xl">앗, 없는 주소예요</h1>
          <p className="max-w-md break-keep text-base font-medium leading-relaxed text-muted-foreground sm:text-lg">
            찾는 페이지가 여기에 없어요. 홈으로 돌아가거나 이전 페이지로 이동해보세요.
          </p>
        </div>

        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <Link href="/" className={cn(buttonVariants({ variant: "cta" }), "h-11 gap-3 px-8 text-base font-bold")}>
            <Home className="h-5 w-5" aria-hidden />
            홈으로 가기
          </Link>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="group flex h-11 items-center gap-1.5 rounded-control px-4 text-sm font-medium text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronLeft className="h-4 w-4 transition-transform duration-fast group-hover:-translate-x-0.5" aria-hidden />
            이전으로 가기
          </button>
        </div>
      </div>

      <NotFoundRoom className="order-first mx-auto w-full max-w-sm lg:order-none lg:max-w-none" />
    </main>
  );
}
