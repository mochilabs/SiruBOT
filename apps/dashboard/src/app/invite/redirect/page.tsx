"use client";

import Link from "next/link";
import {
  CheckCircle2,
  ChevronRight,
  Home,
  Settings2,
  Sparkles,
} from "lucide-react";

import { InteractiveGlow } from "@/components/interactive-glow";

export default function InviteRedirectPage() {
  return (
    <main className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-4 sm:px-6 lg:px-8">
      {/* Dynamic Background Effect */}
      <InteractiveGlow />

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
              <div className="flex h-32 w-32 items-center justify-center rounded-full bg-linear-to-tr from-green-500/20 via-green-500/5 to-primary/10 p-6 shadow-[0_0_50px_-10px_rgba(34,197,94,0.3)]">
                <CheckCircle2 className="h-16 w-16 text-green-500" />
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
              className="group relative flex items-center justify-center gap-3 overflow-hidden rounded-full bg-primary px-10 py-5 text-xl font-bold text-white shadow-[0_20px_40px_-15px_rgba(255,133,193,0.5)] transition-all duration-300 hover:scale-105 hover:bg-primary/90 active:scale-95"
            >
              <div className="absolute inset-0 translate-x-[-100%] bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-[100%]" />
              <Settings2 className="h-6 w-6" />
              설정하러 가기
              <ChevronRight className="h-6 w-6 transition-transform group-hover:translate-x-1" />
            </Link>

            <Link
              href="/"
              className="group flex items-center gap-2 text-lg font-semibold text-muted-foreground/60 transition-all hover:text-primary"
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
