"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useInView, useReducedMotion } from "framer-motion";
import { ArrowRight, LayoutDashboard } from "lucide-react";

import {
  DiscordCommandAnimation,
  slideConfigs,
} from "@/components/home/discord-command-animation";
import { ROTATING_WORDS, WordRotator } from "@/components/home/word-rotator";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function HeroSection() {
  const [activeSlide, setActiveSlide] = useState(0);
  const heroRef = useRef<HTMLElement>(null);
  const shouldReduce = useReducedMotion();

  // 히어로가 보이기 시작하면 데모를 재생해요.
  const heroInView = useInView(heroRef, { once: true, amount: 0.2 });

  // 한 예시(커서 → 타이핑 → 전송 → 응답 → 버튼 클릭)가 끝나면 다음 예시로 넘어가요.
  // 칩을 직접 눌러도 그 예시부터 이어서 순환해요.
  // 모바일에선 탭 줄이 가로 스크롤이라, 자동으로 넘어간 탭이 화면 밖에 있으면 탭 줄만 옮겨 보이게 해요 (페이지 스크롤은 건드리지 않아요)
  const tabListRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = tabListRef.current;
    const tab = list?.children[activeSlide] as HTMLElement | undefined;
    if (!list || !tab || list.scrollWidth <= list.clientWidth) return;
    list.scrollTo({
      left: tab.offsetLeft - (list.clientWidth - tab.offsetWidth) / 2,
      behavior: shouldReduce ? "auto" : "smooth",
    });
  }, [activeSlide, shouldReduce]);

  return (
    <section
      ref={heroRef}
      id="hero-section"
      className="relative overflow-hidden"
    >
      {/* 히어로를 위로 올리고, 아래 스탯·기능 카드가 첫 화면 하단에 걸쳐 보이게 해요. 데모 컬럼이 더 넓어요 */}
      <div className="relative mx-auto grid w-full max-w-7xl items-center gap-10 px-4 pb-10 pt-8 sm:px-6 sm:pb-20 sm:pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-12 lg:px-8 lg:pb-24 lg:pt-10 xl:gap-16">
        <div className="flex min-w-0 flex-col items-center gap-6 text-center lg:items-start lg:text-left">
          <h1 className="text-[clamp(1.75rem,9vw,2.25rem)] font-black leading-[1.12] tracking-tighter text-foreground break-keep sm:text-5xl lg:text-[clamp(2.5rem,3.8vw,3.375rem)]">
            음악부터 AI까지,
            <br />
            <span className="text-primary-text">
              {shouldReduce ? ROTATING_WORDS[0] : <WordRotator />}
            </span>
            <br />
            시루봇 하나면 돼요
          </h1>

          <p className="max-w-xl text-base font-medium leading-relaxed text-muted-foreground break-keep sm:text-lg">
            명령어는 Discord에서, 설정은 웹 대시보드에서.
            <br className="hidden sm:block" /> 서버에 맞게 골라 쓰는 음악·AI
            봇이에요.
          </p>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link
              href="/invite"
              className={cn(
                buttonVariants({ variant: "cta", size: "xl" }),
                "group w-full text-base sm:w-auto",
              )}
            >
              지금 초대하기
              <ArrowRight
                size={17}
                aria-hidden
                className="transition-transform duration-fast group-hover:translate-x-0.5"
              />
            </Link>
            <Link
              href="/servers"
              className={cn(
                buttonVariants({ variant: "secondary", size: "xl" }),
                "w-full text-base sm:w-auto",
              )}
            >
              <LayoutDashboard size={17} aria-hidden />
              대시보드 시작하기
            </Link>
          </div>
        </div>

        {/* 데모 컬럼 — 컨테이너 오른쪽 끝까지 채워 크게 보여요. 예시 탭은 카드 위에 붙어요 */}
        <div className="flex min-w-0 flex-col gap-3">
          <div
            ref={tabListRef}
            role="tablist"
            aria-label="Discord 명령어 예시"
            className="relative -mx-4 flex scrollbar-none items-center gap-0.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 lg:flex-nowrap lg:justify-between"
          >
            {slideConfigs.map((slide, index) => (
              <button
                key={slide.command}
                type="button"
                role="tab"
                aria-selected={activeSlide === index}
                onClick={() => setActiveSlide(index)}
                className={cn(
                  "min-h-11 shrink-0 cursor-pointer whitespace-nowrap rounded-control px-2 py-2 text-xs font-bold transition-colors duration-fast sm:min-h-0 sm:py-1.5",
                  activeSlide === index
                    ? "bg-primary/10 text-primary-text"
                    : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                )}
              >
                {slide.command}
              </button>
            ))}
          </div>
          <div className="min-w-0">
            <DiscordCommandAnimation
              activeSlide={activeSlide}
              active={heroInView}
              onDone={() =>
                setActiveSlide((prev) => (prev + 1) % slideConfigs.length)
              }
            />
          </div>
        </div>
      </div>
    </section>
  );
}
