"use client";

import { useEffect, useState } from "react";
import { useInView } from "react-intersection-observer";
import Image from "next/image";
import { Clock, Hash } from "lucide-react";

import { cn } from "@/lib/utils";

/** 커스텀 명령어 데모 — 접두사 명령어 하나가 메시지·대기 스텝을 순서대로 실행하는 모습 */
const DEMO_COMMAND = "!아침브리핑";
const DEMO_STEPS = [
  { type: "message", text: "좋은 아침이에요! 오늘의 일정을 요약해 드릴게요." },
  { type: "delay", label: "1초 대기" },
  { type: "message", text: "- 오전 9시: 팀 회의\n- 오후 2시: 코드 리뷰" },
] as const;

const STEP_MS = 1800;

/**
 * 커스텀 명령어 프리뷰(mockup) — 채널에 "!이름"을 치면 시루가 스텝을 순서대로 실행해요.
 * Discord 채널 프레임(헤더·푸터) 안에 명령어 입력과 실행 결과가 있고,
 * 실행 중인 스텝만 표시가 켜져 순서를 보여줘요.
 * 행은 처음부터 전부 렌더되고 상태만 바뀌어 레이아웃이 밀리지 않아요.
 */
export function CustomCommandPreview() {
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.3 });
  /** -1: 대기(아직 미실행), 0: 명령어 입력, 1~3: 실행 중인 스텝 순번 */
  const [step, setStep] = useState(-1);

  useEffect(() => {
    if (!inView) return undefined;
    if (step === -1) {
      const timer = setTimeout(() => setStep(0), 700);
      return () => clearTimeout(timer);
    }
    const isLast = step > DEMO_STEPS.length;
    const timer = setTimeout(
      () => setStep(isLast ? -1 : step + 1),
      isLast ? STEP_MS + 700 : STEP_MS,
    );
    return () => clearTimeout(timer);
  }, [inView, step]);

  return (
    <div
      ref={ref}
      className="flex min-w-0 flex-col overflow-hidden rounded-card bg-discord-embed"
    >
      {/* 채널 헤더 */}
      <div className="flex items-center gap-2 border-b border-discord-btn-active px-4 py-2.5">
        <Hash
          size={14}
          className="shrink-0 text-discord-text-muted"
          aria-hidden
        />
        <span className="min-w-0 truncate text-xs font-semibold text-discord-text">
          봇-명령어
        </span>
        <span className="ml-auto shrink-0 text-2xs text-discord-text-muted">
          시루 · 접두사 명령어
        </span>
      </div>

      <div className="flex flex-col gap-3 p-3 sm:p-4">
        {/* 명령어 입력 — 채널에 친 메시지 */}
        <div className="flex gap-2.5">
          <span
            aria-hidden
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-discord-btn-active text-2xs font-bold text-discord-text-muted"
          >
            사
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold text-discord-text">
                사용자
              </span>
              <span className="text-2xs text-discord-text-muted">
                오후 8:10
              </span>
            </div>
            <div
              className={cn(
                "mt-0.5 inline-flex rounded-sm px-1.5 py-0.5 transition-colors duration-fast",
                step >= 0
                  ? "bg-discord-btn-active/70 text-discord-text"
                  : "text-discord-text-muted",
              )}
            >
              <span className="text-sm font-semibold">{DEMO_COMMAND}</span>
            </div>
          </div>
        </div>

        {/* 시루 실행 결과 — 메시지·대기 스텝이 순서대로 켜져요 */}
        <div className="flex gap-2.5">
          <span className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full">
            <Image
              src="/images/profile.png"
              alt="시루"
              fill
              className="object-cover"
              sizes="28px"
            />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-discord-text">
                시루
              </span>
              <span className="rounded-sm bg-discord-primary px-1 py-0.5 text-2xs font-bold leading-none text-primary-control-text">
                앱
              </span>
              <span className="text-2xs text-discord-text-muted">
                오후 8:10
              </span>
            </div>
            <div className="mt-0.5 flex flex-col gap-1">
              {DEMO_STEPS.map((demoStep, index) => {
                const running = step === index + 1;
                if (demoStep.type === "delay") {
                  return (
                    <div
                      key="delay"
                      className={cn(
                        "flex items-center gap-1.5 rounded-control px-2 py-1 transition-colors duration-fast",
                        running
                          ? "bg-discord-btn-active/40 text-discord-text"
                          : "text-discord-text-muted",
                      )}
                    >
                      <Clock size={10} aria-hidden />
                      <span className="text-2xs font-bold">
                        {demoStep.label}
                      </span>
                    </div>
                  );
                }
                return (
                  <p
                    key={demoStep.text}
                    className={cn(
                      "whitespace-pre-line break-words rounded-control px-2 py-1 text-sm leading-relaxed transition-colors duration-fast",
                      running
                        ? "bg-discord-btn-active/40 font-medium text-discord-text"
                        : "text-discord-text-muted",
                    )}
                  >
                    {demoStep.text}
                  </p>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 푸터 */}
      <p className="border-t border-discord-btn-active px-4 py-2 text-2xs text-discord-text-muted">
        대시보드 블록 빌더로 만들고, AI에게 설명하면 초안이 만들어져요.
      </p>
    </div>
  );
}
