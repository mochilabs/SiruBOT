"use client";

import Image from "next/image";
import Link from "next/link";
import { m } from "framer-motion";

import { sectionVariants } from "@/components/home/section-variants";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** 마지막 CTA — 푸터 앞 초대 티켓. 퍼포레이션 노치로 티켓 모티프를 만들어요. */
export function InviteTicketSection() {
  return (
    <section className="pb-16 sm:pb-24">
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
        <m.div
          className="relative"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
          variants={sectionVariants}
        >
          {/* 티켓 본체 — 그림자는 토큰 elevation(shadow-lg/2xl)으로. 노치 mask는 mask-*로 유지해요 */}
          <div className="relative grid overflow-hidden rounded-card bg-surface-1 shadow-lg transition-transform duration-base hover:-rotate-[0.4deg] dark:shadow-2xl sm:grid-cols-[7.5rem_1fr] sm:[mask-composite:intersect] sm:[mask-image:radial-gradient(circle_at_120px_0,transparent_12px,#000_12.5px),radial-gradient(circle_at_120px_100%,transparent_12px,#000_12.5px)]">
            {/* 스텁 — 데스크톱만 */}
            <div className="relative hidden flex-col items-center justify-center gap-3 border-r border-dashed border-border py-8 sm:flex">
              <div className="relative h-8 w-8 overflow-hidden rounded-full">
                <Image
                  src="/images/profile.png"
                  alt=""
                  fill
                  className="object-cover"
                  sizes="32px"
                />
              </div>
              <span className="[writing-mode:vertical-rl] text-2xs font-black tracking-[0.3em] text-primary-text">
                SIRUBOT
              </span>
              <span className="[writing-mode:vertical-rl] text-2xs font-medium tracking-[0.3em] text-muted-foreground">
                INVITE
              </span>
            </div>
            {/* 본문 */}
            <div className="flex min-w-0 flex-col gap-3 p-6 sm:p-8">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-2xs font-medium text-muted-foreground">
                  초대 티켓
                </span>
              </div>
              <h2 className="text-2xl font-black tracking-tighter text-foreground sm:text-3xl">
                시루를 서버에 초대해 보세요
              </h2>
              <p className="text-sm font-medium leading-relaxed text-muted-foreground sm:text-base">
                음악과 AI, 다양한 편의 기능을 지금 바로 시작할 수 있어요.
              </p>
              <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                <Link
                  href="/invite"
                  className={cn(
                    buttonVariants({ variant: "cta", size: "lg" }),
                    "h-11 w-full text-base sm:w-auto",
                  )}
                >
                  시루봇 초대하기
                </Link>
                <Link
                  href="/servers"
                  className={cn(
                    buttonVariants({ variant: "secondary", size: "lg" }),
                    "h-11 w-full text-base sm:w-auto",
                  )}
                >
                  대시보드 둘러보기
                </Link>
              </div>
            </div>
          </div>
          {/* 스터브 경계(x = 7.5rem)에 놓인 위아래 노치는 위 마스크가 만들어요 */}
        </m.div>
      </div>
    </section>
  );
}
