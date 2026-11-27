"use client";

import { useEffect, useState } from "react";
import { useInView } from "react-intersection-observer";
import Image from "next/image";
import { AnimatePresence, m } from "framer-motion";
import { Bot, CornerDownRight } from "lucide-react";

import { motionBase, motionFast } from "@/components/motion/durations";
import { cn } from "@/lib/utils";

const CARD_PRESETS = [
  {
    label: "기본",
    className: "bg-primary-control text-primary-control-text",
    title: "서름님을 환영해요",
    sub: "1,234번째 멤버",
  },
  {
    label: "파티",
    className: "bg-discord-primary text-white",
    title: "다들 박수!",
    sub: "서름님이 새 친구로 합류했어요",
  },
  {
    label: "따뜻",
    className: "bg-accent text-accent-foreground",
    title: "오늘의 첫 방문이예요",
    sub: "서름님이 문을 두드렸어요",
  },
];

export function MemberGreetingPreview() {
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.3 });
  const [presetIndex, setPresetIndex] = useState(0);
  const preset = CARD_PRESETS[presetIndex];
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!inView) return undefined;
    setPhase(0);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPhase(2);
      return undefined;
    }
    const joinTimer = setTimeout(() => setPhase(1), 350);
    const greetTimer = setTimeout(() => setPhase(2), 1100);
    return () => {
      clearTimeout(joinTimer);
      clearTimeout(greetTimer);
    };
  }, [inView]);

  return (
    <div
      ref={ref}
      className="flex flex-col overflow-hidden rounded-card bg-discord-embed"
    >
      <div className="flex items-center gap-2 border-b border-discord-btn-active px-4 py-2.5">
        <Bot size={14} className="text-discord-text-muted" aria-hidden />
        <span className="text-xs font-semibold text-discord-text">
          가입-알림
        </span>
        <span className="ml-auto text-2xs text-discord-text-muted">
          시루 · 입장 인사
        </span>
      </div>
      <div className="relative h-[300px] overflow-hidden sm:h-[360px]">
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key="greeting"
            className="absolute inset-x-3.5 top-3.5 space-y-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: motionFast, ease: "easeOut" }}
          >
            {phase >= 1 && (
              <m.p
                className="flex items-center gap-1.5 text-2xs text-discord-text-muted"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: motionBase, ease: "easeOut" }}
              >
                <CornerDownRight
                  size={12}
                  className="shrink-0 text-success"
                  aria-hidden
                />
                <span>
                  <span className="font-bold text-success">서름</span>님이
                  서버에 참여했어요
                </span>
                <span className="ml-auto">오후 3:21</span>
              </m.p>
            )}
            {phase >= 2 && (
              <m.div
                className="flex gap-2.5"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: motionBase, ease: "easeOut" }}
              >
                <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full">
                  <Image
                    src="/images/siru-profile.png"
                    alt="시루"
                    fill
                    className="object-cover"
                    sizes="32px"
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-discord-text">
                      시루
                    </span>
                    <span className="rounded-sm bg-discord-primary px-1 py-0.5 text-2xs font-bold leading-none text-primary-control-text">
                      앱
                    </span>
                    <span className="text-2xs text-discord-text-muted">
                      오후 3:21
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-discord-text">
                    서름님, 시루봇 테스트 서버에 오신 걸 환영해요!
                  </p>
                  <div
                    key={preset.label}
                    className={`relative aspect-[2/1] w-full max-w-md overflow-hidden rounded-card ${preset.className}`}
                  >
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-discord-btn-active text-xs font-bold text-discord-text ring-2 ring-background/40 ring-offset-2 ring-offset-transparent">
                        서름
                      </div>
                      <p className="text-base font-extrabold tracking-tighter">
                        {preset.title}
                      </p>
                      <AnimatePresence mode="wait" initial={false}>
                        <m.p
                          key={preset.sub}
                          className="text-2xs font-semibold opacity-80"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: motionFast, ease: "easeOut" }}
                        >
                          {preset.sub}
                        </m.p>
                      </AnimatePresence>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-2xs font-medium text-discord-text-muted">
                      카드 프리셋
                    </p>
                    {CARD_PRESETS.map((candidate, index) => (
                      <button
                        key={candidate.label}
                        type="button"
                        aria-pressed={presetIndex === index}
                        onClick={() => setPresetIndex(index)}
                        className={cn(
                          "cursor-pointer rounded-sm px-1.5 py-0.5 text-2xs font-bold transition-colors duration-fast",
                          presetIndex === index
                            ? "bg-discord-primary text-primary-control-text"
                            : "bg-discord-btn-active text-discord-text-muted hover:text-discord-text",
                        )}
                      >
                        {candidate.label}
                      </button>
                    ))}
                  </div>
                </div>
              </m.div>
            )}
          </m.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
