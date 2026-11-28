"use client";

import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function InviteTicketSection() {
  return (
    <section className="pb-16 sm:pb-24">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative flex flex-col gap-8 overflow-hidden rounded-card bg-primary-control/10 p-8 text-foreground sm:p-12 lg:flex-row lg:items-center lg:justify-between">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <span className="absolute -top-24 -right-16 h-72 w-72 rounded-full bg-primary-control/15 sm:h-96 sm:w-96" />
            <span className="absolute -right-6 -bottom-20 h-48 w-48 rotate-12 rounded-[2.5rem] bg-primary-control/10 sm:right-40 sm:h-56 sm:w-56" />
          </div>
          <div className="relative flex min-w-0 flex-col gap-3">
            <h2 className="break-keep text-balance text-3xl font-extrabold tracking-tighter sm:text-5xl">
              시루를 서버에 초대해 보세요
            </h2>
            <p className="break-keep text-base font-medium leading-relaxed text-muted-foreground sm:text-lg">
              음악과 AI, 다양한 편의 기능을 지금 바로 시작할 수 있어요.
            </p>
          </div>
          <div className="relative flex flex-col gap-3 sm:flex-row sm:shrink-0">
            <Link
              href="/invite"
              className={cn(buttonVariants({ variant: "cta", size: "lg" }), "h-12 w-full text-base sm:w-auto")}
            >
              시루봇 초대하기
            </Link>
            <Link
              href="/servers"
              className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "h-12 w-full text-base sm:w-auto")}
            >
              대시보드 둘러보기
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
