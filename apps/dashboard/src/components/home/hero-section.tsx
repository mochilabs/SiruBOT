"use client";

import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, m, useInView, useReducedMotion } from "framer-motion";
import { ArrowRight, LayoutDashboard, Pause, Play } from "lucide-react";

import {
  DiscordCommandAnimation,
  slideConfigs,
} from "@/components/home/discord-command-animation";
import { ROTATING_WORDS, WordRotator } from "@/components/home/word-rotator";
import { motionBase, motionSlow } from "@/components/motion/durations";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function HeroSection() {
  const [activeSlide, setActiveSlide] = useState(0);
  const heroRef = useRef<HTMLElement>(null);
  const shouldReduce = useReducedMotion();

  // 히어로가 화면에 보이고 탭이 활성일 때만 움직여요. 벗어나면 멈췄다가, 돌아오면 현재 예시를 처음부터 다시 재생해요.
  const heroInView = useInView(heroRef, { amount: 0.2 });
  const [pageVisible, setPageVisible] = useState(true);
  useEffect(() => {
    const sync = () => setPageVisible(!document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  // 사용자가 직접 멈추는 일시정지(데모와 헤드라인 회전을 함께 제어해요). 마우스를 헤드라인에 올리면 회전만 잠시 멈춰요.
  const [paused, setPaused] = useState(false);
  const [headlineHover, setHeadlineHover] = useState(false);
  const playing = heroInView && pageVisible && !paused;

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

  // 탭 키보드 패턴: 화살표로 이동하고, 선택된 탭만 Tab 순서에 들어가요
  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = slideConfigs.length - 1;
    const next =
      event.key === "ArrowRight" ? (activeSlide + 1) % slideConfigs.length
      : event.key === "ArrowLeft" ? (activeSlide + last) % slideConfigs.length
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : null;
    if (next === null) return;
    event.preventDefault();
    setActiveSlide(next);
    (tabListRef.current?.children[next] as HTMLElement | undefined)?.focus();
  };

  return (
    <section
      ref={heroRef}
      id="hero-section"
      className="relative overflow-hidden"
    >
      {/* 히어로를 위로 올리고, 아래 스탯·기능 카드가 첫 화면 하단에 걸쳐 보이게 해요. 데모 컬럼이 더 넓어요 */}
      <div className="relative mx-auto grid w-full max-w-7xl items-center gap-8 px-4 pb-10 pt-8 sm:gap-10 sm:px-6 sm:pb-20 sm:pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-12 lg:px-8 lg:pb-24 lg:pt-10 xl:gap-16">
        <div className="flex min-w-0 flex-col items-start gap-5 text-left sm:gap-6">
          <h1
            onPointerEnter={(event) => event.pointerType === "mouse" && setHeadlineHover(true)}
            onPointerLeave={() => setHeadlineHover(false)}
            className="text-[clamp(2.05rem,9vw,2.85rem)] font-extrabold leading-[1.16] tracking-tight text-balance text-foreground break-keep sm:text-5xl lg:text-[clamp(2.5rem,3.8vw,3.375rem)]">
            음악부터 AI까지,
            <br />
            <span className="text-primary-text">
              {shouldReduce ? ROTATING_WORDS[0] : <WordRotator running={playing && !headlineHover} />}
            </span>
            <br />
            시루봇 하나면 돼요
          </h1>

          <p className="max-w-xl text-[0.9375rem] font-medium leading-relaxed text-muted-foreground break-keep sm:text-lg">
            명령어는 Discord에서, 설정은 웹 대시보드에서.
            <br />
            한국어 커뮤니티를 위한 올인원 봇이에요.
          </p>

          <div className="flex flex-wrap items-center justify-start gap-2.5 sm:gap-3">
            <Link
              href="/invite"
              className={cn(
                buttonVariants({ variant: "cta", size: "xl" }),
                "group h-11 px-4 text-sm sm:px-5 sm:text-base",
              )}
            >
              지금 초대하기
              <ArrowRight
                size={16}
                aria-hidden
                className="transition-transform duration-fast group-hover:translate-x-0.5"
              />
            </Link>
            <Link
              href="/servers"
              className={cn(
                buttonVariants({ variant: "secondary", size: "xl" }),
                "h-11 px-4 text-sm sm:px-5 sm:text-base",
              )}
            >
              <LayoutDashboard size={16} aria-hidden />
              대시보드 시작하기
            </Link>
          </div>
        </div>

        {/* 데모 컬럼 — 컨테이너 오른쪽 끝까지 채워 크게 보여요. 예시 탭은 카드 위에 붙고, 일시정지 버튼이 줄 끝에 있어요 */}
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex items-center gap-1">
            <div
              ref={tabListRef}
              role="tablist"
              aria-label="Discord 명령어 예시"
              onKeyDown={onTabKeyDown}
              className="relative flex min-w-0 flex-1 scrollbar-none items-center gap-0.5 overflow-x-auto sm:flex-wrap sm:overflow-visible lg:flex-nowrap lg:justify-between"
            >
              {slideConfigs.map((slide, index) => (
                <button
                  key={slide.command}
                  id={`hero-tab-${index}`}
                  type="button"
                  role="tab"
                  aria-selected={activeSlide === index}
                  aria-controls="hero-demo-panel"
                  tabIndex={activeSlide === index ? 0 : -1}
                  onClick={() => setActiveSlide(index)}
                  className={cn(
                    "min-h-11 shrink-0 cursor-pointer whitespace-nowrap rounded-control px-2 py-2 text-xs font-bold transition-colors duration-fast sm:min-h-9 sm:py-1.5",
                    activeSlide === index
                      ? "bg-primary/10 text-primary-text"
                      : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                  )}
                >
                  {slide.command}
                </button>
              ))}
            </div>
            {!shouldReduce && (
              <button
                type="button"
                aria-label={paused ? "데모 재생" : "데모 일시정지"}
                aria-pressed={paused}
                onClick={() => setPaused((prev) => !prev)}
                className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-control text-muted-foreground transition-[color,background-color,transform] duration-fast hover:bg-surface-2 hover:text-foreground active:scale-95 sm:size-9"
              >
                {/* 아이콘이 바뀔 때 반 바퀴씩 돌아 나가고 들어와서, 합쳐 한 바퀴처럼 보여요 */}
                <span className="relative flex size-4 items-center justify-center">
                  <AnimatePresence initial={false} mode="popLayout">
                    <m.span
                      key={paused ? "play" : "pause"}
                      className="flex"
                      initial={{ rotate: -180, scale: 0.4, opacity: 0 }}
                      animate={{ rotate: 0, scale: 1, opacity: 1, transition: { duration: motionSlow, ease: [0.23, 1, 0.32, 1] } }}
                      exit={{ rotate: 180, scale: 0.4, opacity: 0, transition: { duration: motionBase, ease: [0.23, 1, 0.32, 1] } }}
                    >
                      {paused ? <Play size={16} fill="currentColor" aria-hidden /> : <Pause size={16} fill="currentColor" aria-hidden />}
                    </m.span>
                  </AnimatePresence>
                </span>
              </button>
            )}
          </div>
          <div
            id="hero-demo-panel"
            role="tabpanel"
            aria-labelledby={`hero-tab-${activeSlide}`}
            className="min-w-0"
          >
            <p className="sr-only">
              Discord에서 {slideConfigs[activeSlide].command} 명령어를 쓰면 시루가 응답하는 예시 화면이에요.
            </p>
            <DiscordCommandAnimation
              activeSlide={activeSlide}
              active={playing}
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
