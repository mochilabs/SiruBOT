"use client";

import Image from "next/image";
import Link from "next/link";
import { m } from "framer-motion";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const sectionVariants = {
	hidden: { opacity: 0, y: 24 },
	visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
} as const;

/** 마지막 CTA — 푸터 앞 초대 티켓. 뒤에 겹친 두 번째 티켓과 퍼포레이션 노치로 티켓 모티프를 만들어요. */
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
					{/* 뒤에 살짝 겹치는 두 번째 티켓 — depth */}
					<div aria-hidden className="absolute inset-x-5 -bottom-4 -top-2 rounded-card bg-surface-2 -rotate-1 sm:-rotate-2" />
					{/* 티켓 본체 */}
					<div className="relative grid overflow-hidden rounded-card bg-surface-1 shadow-lg transition-transform duration-base hover:-rotate-[0.4deg] sm:grid-cols-[7.5rem_1fr]">
						{/* 스텁 — 데스크톱만 */}
						<div className="relative hidden flex-col items-center justify-center gap-3 border-r border-dashed border-border py-8 sm:flex">
							<div className="relative h-8 w-8 overflow-hidden rounded-full">
								<Image src="/images/profile.png" alt="" fill className="object-cover" sizes="32px" />
							</div>
							<span className="[writing-mode:vertical-rl] text-2xs font-black tracking-[0.3em] text-primary-text">SIRUBOT</span>
							<span className="[writing-mode:vertical-rl] text-2xs font-medium tracking-[0.3em] text-muted-foreground">INVITE</span>
						</div>
						{/* 본문 */}
						<div className="flex min-w-0 flex-col gap-3 p-6 sm:p-8">
							<div className="flex flex-wrap items-center justify-between gap-2">
								<span className="text-2xs font-medium text-muted-foreground">초대 티켓</span>
								<span className="rounded-sm border border-success/20 bg-success/10 px-1.5 py-0.5 text-2xs font-bold text-success">
									모든 기능 무료 · 구독 없음
								</span>
							</div>
							<h2 className="text-2xl font-black tracking-tighter text-foreground sm:text-3xl">서버에 시루를 초대해요</h2>
							<p className="text-sm font-medium leading-relaxed text-muted-foreground sm:text-base">
								초대가 끝나면 시루가 새 멤버로 합류해요. 첫 인사부터 음악 준비까지 바로 시작돼요.
							</p>
							<div className="flex flex-col gap-3 pt-2 sm:flex-row">
								<Link href="/invite" className={cn(buttonVariants({ variant: "cta", size: "lg" }), "h-11 w-full text-base sm:w-auto")}>
									시루봇 초대하기
								</Link>
								<Link href="/servers" className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "h-11 w-full text-base sm:w-auto")}>
									대시보드 둘러보기
								</Link>
							</div>
						</div>
					</div>
					{/* 퍼포레이션 노치 — 티켓 경계를 페이지 배경색 원으로 뚫은 느낌(스텁 경계 x = 7.5rem, 노치 지름 1.5rem → 좌측 6.75rem) */}
					<div aria-hidden className="absolute -top-3 left-[6.75rem] hidden h-6 w-6 rounded-full bg-background sm:block" />
					<div aria-hidden className="absolute -bottom-3 left-[6.75rem] hidden h-6 w-6 rounded-full bg-background sm:block" />
				</m.div>
			</div>
		</section>
	);
}