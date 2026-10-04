"use client";

import Link from "next/link";
import {
  CheckCircle2,
  ChevronRight,
  Home,
  Settings2
} from "lucide-react";

export default function InviteRedirectPage() {
  return (
    <main className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-4 sm:px-6 lg:px-8">
      <div className="relative z-10 flex flex-col items-center text-center">
        {/* Immersive Background Text */}
        <div className="absolute inset-0 -z-10 flex items-center justify-center">
          <span className="text-[12rem] sm:text-[20rem] md:text-[30rem] font-black text-primary/5 select-none tracking-tighter uppercase whitespace-nowrap">
            고마워요
          </span>
        </div>

        <div className="space-y-12">
          <div className="flex flex-col items-center space-y-6">
            {/* Success Symbol */}
            <div className="relative">
              <div className="flex h-32 w-32 items-center justify-center rounded-full border border-border bg-surface-1 p-6">
                <CheckCircle2 className="h-16 w-16 text-success" />
              </div>
            </div>

            <div className="space-y-4">
              <h1 className="text-title-gradient text-5xl font-extrabold tracking-tighter md:text-7xl break-keep">
                초대해줘서 고마워요!
              </h1>
              <p className="text-lg font-medium leading-relaxed text-muted-foreground/80 md:text-xl max-w-xl break-keep">
                이제 다 됐어요!
                <br />
                나에게 딱 맞는 설정으로 대시보드를 꾸며볼까요?
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-4">
            <Link
              href="/servers"
              className="inline-flex h-11 items-center justify-center gap-3 rounded-control bg-primary px-8 text-base font-bold text-primary-foreground transition-colors duration-fast hover:bg-primary/90"
              >
              <Settings2 className="h-5 w-5" />
              설정하러 가기
              <ChevronRight className="h-4 w-4 opacity-70" />
            </Link>

            <Link
              href="/"
              className="group flex items-center gap-2 text-lg font-semibold text-muted-foreground/60 transition-colors hover:text-primary"
            >
              <Home className="h-5 w-5" />
              홈으로 가기
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
