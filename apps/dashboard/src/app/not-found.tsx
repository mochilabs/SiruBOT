"use client";

import Link from "next/link";
import { m, useReducedMotion } from "framer-motion";
import { ChevronLeft, Home } from "lucide-react";

import { FocusPageShell } from "@/app/_components/focus-page-shell";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * 형태 띠 — 푸터의 기하학적 모티프(원·둥근 사각형·반원)를 배경에 흘려 보내요. 가장자리는 마스크로 사라져요.
 * 사유(R-19): 404 페이지의 아이덴티티 모티프 — 예외 페이지에도 브랜드 기하학이 살아있게 하는 장식 루프로,
 * reduced-motion 환경에서는 정지한 띠로만 노출된다.
 */
function ShapeBand({
  className,
  duration,
}: {
  className: string;
  duration: number;
}) {
  const reducedMotion = useReducedMotion();

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute h-10 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)] ${className}`}
    >
      <m.svg
        aria-hidden
        className="h-full"
        style={{ width: "200%" }}
        animate={reducedMotion ? undefined : { x: ["0%", "-50%"] }}
        transition={{ duration, repeat: Infinity, ease: "linear" }}
      >
        <defs>
          <pattern
            id={`notfound-shape-band-${className.replace(/[^a-z0-9]/gi, "")}`}
            width="104"
            height="40"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="12" cy="20" r="6" className="fill-primary/25" />
            <rect
              x="34"
              y="13"
              width="14"
              height="14"
              rx="4"
              className="fill-foreground/12"
            />
            <path d="M 64 27 a 8 8 0 0 1 16 0 Z" className="fill-primary/20" />
            <circle cx="94" cy="20" r="3.5" className="fill-foreground/20" />
          </pattern>
        </defs>
        <rect
          width="200%"
          height="100%"
          fill={`url(#notfound-shape-band-${className.replace(/[^a-z0-9]/gi, "")})`}
        />
      </m.svg>
    </div>
  );
}

export default function NotFound() {
  return (
    <FocusPageShell>
      {/* 형태 띠 2줄 — 위에서 아래로 리듬감 있게 흘러가요 */}
      <ShapeBand className="top-[18%] left-0 w-full" duration={28} />
      <ShapeBand className="bottom-[18%] left-0 w-full" duration={32} />

      <div className="relative z-10 flex flex-col items-center text-center">
        <div className="space-y-8">
          <div className="space-y-3">
            <h1 className="text-4xl font-black tracking-tighter text-foreground break-keep sm:text-5xl md:text-6xl">
              앗, 없는 주소예요
            </h1>
            <p className="mx-auto max-w-md text-base font-medium leading-relaxed text-muted-foreground break-keep sm:text-lg">
              찾는 페이지가 여기에 없어요. 홈으로 돌아가거나 이전 페이지로
              이동해보세요.
            </p>
          </div>

          <div className="flex flex-col items-center gap-4 pt-2 sm:flex-row sm:justify-center">
            <Link href="/" className={cn(buttonVariants({ variant: "cta" }), "h-11 gap-3 px-8 text-base font-bold")}>
              <Home className="h-5 w-5" aria-hidden />
              홈으로 가기
            </Link>
            <button
              type="button"
              onClick={() => window.history.back()}
              className="group flex h-11 pointer-coarse:min-h-11 items-center gap-1.5 rounded-control px-4 text-sm font-medium text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <ChevronLeft
                className="h-4 w-4 transition-transform duration-fast group-hover:-translate-x-0.5"
                aria-hidden
              />
              이전으로 가기
            </button>
          </div>
        </div>
      </div>
    </FocusPageShell>
  );
}
