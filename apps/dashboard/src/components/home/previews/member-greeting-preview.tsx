"use client";

import { useEffect, useState } from "react";
import { useInView } from "react-intersection-observer";
import Image from "next/image";
import { AnimatePresence, m } from "framer-motion";
import { Bot, CornerDownRight } from "lucide-react";

import { motionBase, motionFast } from "@/components/motion/durations";
import { cn } from "@/lib/utils";

/** 인사 카드 프리셋 — 에디터가 완성형 디자인을 먼저 고르고, 위에 자유 레이어를 덧칠하는 실제 흐름을 딴 것 */
const CARD_PRESETS = [
  {
    label: "기본",
    className:
      "bg-gradient-to-br from-primary/60 via-primary-control/40 to-primary/60",
    title: "서름님을 환영해요",
    sub: "1,234번째 멤버",
  },
  {
    label: "파티",
    className:
      "bg-gradient-to-tr from-primary-control/60 via-primary/40 to-primary-control/30",
    title: "다들 박수!",
    sub: "서름님이 새 친구로 합류했어요",
  },
  {
    label: "따뜻",
    className: "bg-gradient-to-b from-primary/50 to-primary-control/50",
    title: "오늘의 첫 방문이예요",
    sub: "서름님이 문을 두드렸어요",
  },
];

/**
 * 입장 인사 프리뷰 — 실제 기능은 봇의 memberGreetingService: 멤버가 들어오면 설정한 채널로
 * {유저}·{서버}·{멤버수} 변수가 치환된 템플릿 인사 메시지를 보내요. 이미지 카드 옵션을 켜면
 * data-api가 렌더한 인사 카드가 첨부돼요. 참여 알림 → 시루 인사 → 인사 카드 순서로 재생하고,
 * 카드 프리셋을 골라 바꿔 보면 꾸미기가 자유롭다는 게 바로 보여요.
 *
 * 본문은 높이를 고정(absolute 레이어)해 단계가 진행돼도 아래 레이아웃이 밀리지 않아요.
 * 등장은 짧은 슬라이드+페이드만 쓰고 transform이라 레이아웃을 밀지 않아요.
 */
export function MemberGreetingPreview() {
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.3 });
  const [runId, setRunId] = useState(0);
  const [presetIndex, setPresetIndex] = useState(0);
  const preset = CARD_PRESETS[presetIndex];
  /** 0: 대기, 1: 참여 시스템 메시지, 2: 시루 인사 + 인사 카드 */
  const [phase, setPhase] = useState(0);

  // 테스트 전송(다시 재생)을 누르면 runId만 올려 시퀀스를 처음부터 재생해요
  useEffect(() => {
    if (!inView) return undefined;
    setPhase(0);
    // reduced-motion에선 인사 카드까지 펼친 정지 화면을 바로 보여줘요
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
  }, [inView, runId]);

  /** 테스트 전송 버튼 — 실제 대시보드의 테스트 전송 기능을 딴 리플레이 */
  const replay = () => setRunId((prev) => prev + 1);

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
      {/* 내용이 절대 배치라 컨테이너 높이는 항상 이 고정값 — 아래 섹션이 밀리지 않아요 */}
      <div className="relative h-[300px] overflow-hidden sm:h-[360px]">
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={runId}
            className="absolute inset-x-3.5 top-3.5 space-y-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: motionFast, ease: "easeOut" }}
          >
            {phase >= 1 && (
              // Discord 참여 시스템 메시지 — 이름은 서버 권한 컬러처럼 보이는 초록
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
                    src="/images/profile.png"
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
                  {/* 인사 카드 mock — 실제로는 data-api가 1200×675 PNG로 렌더해 첨부해요 */}
                  <div
                    key={preset.label}
                    className={`relative aspect-[2/1] w-full max-w-md overflow-hidden rounded-card ${preset.className}`}
                  >
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-discord-btn-active text-xs font-bold text-discord-text ring-2 ring-background/40 ring-offset-2 ring-offset-transparent">
                        서름
                      </div>
                      <p className="text-base font-black tracking-tighter text-foreground">
                        {preset.title}
                      </p>
                      <AnimatePresence mode="wait" initial={false}>
                        <m.p
                          key={preset.sub}
                          className="text-2xs font-medium text-foreground/70"
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
                  {/* 카드 프리셋 — 실제 에디터의 완성형 프리셋 흐름 */}
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
      <div className="flex items-center justify-between gap-2 border-t border-discord-btn-active px-4 py-2">
        <button
          type="button"
          onClick={replay}
          className="cursor-pointer rounded-control bg-surface-1 px-3 py-1.5 text-2xs font-bold text-foreground transition-colors duration-fast hover:bg-surface-3"
        >
          테스트 전송
        </button>
        <p className="text-2xs text-discord-text-muted">
          템플릿·채널은 대시보드에서 정해요.
        </p>
      </div>
    </div>
  );
}
