"use client";

import Image from "next/image";
import Link from "next/link";
import { m } from "framer-motion";

import { sectionVariants } from "@/components/home/section-variants";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** 마지막 CTA — 푸터 앞 초대 카드. */
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
          <div className="relative flex flex-col gap-6 overflow-hidden rounded-card border border-border-subtle bg-surface-1 p-6 shadow-lg transition-transform duration-base hover:-rotate-[0.4deg] dark:shadow-2xl sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div className="flex min-w-0 flex-col gap-2">
              <div className="inline-flex items-center gap-2">
                <div className="relative h-5 w-5 overflow-hidden rounded-full ring-1 ring-border-subtle">
                  <Image
                    src="/images/profile.png"
                    alt=""
                    fill
                    className="object-cover"
                    sizes="20px"
                  />
                </div>
                <span className="text-2xs font-black tracking-widest text-primary-text">
                  SIRUBOT INVITE
                </span>
              </div>
              <h2 className="text-2xl font-black tracking-tighter text-foreground sm:text-3xl">
                시루를 서버에 초대해 보세요
              </h2>
              <p className="text-sm font-medium leading-relaxed text-muted-foreground sm:text-base">
                음악과 AI, 다양한 편의 기능을 지금 바로 시작할 수 있어요.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:shrink-0">
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
        </m.div>
      </div>
    </section>
  );
}
