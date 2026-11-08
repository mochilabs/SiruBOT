"use client";

import { useEffect, useState } from "react";
import { useInView } from "react-intersection-observer";
import Image from "next/image";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { Check, Lock, Plus, Ticket, Volume2 } from "lucide-react";

import { motionBase, motionFast } from "@/components/motion/durations";
import { cn } from "@/lib/utils";

const TABS = [
	{ key: "roles", label: "역할 패널" },
	{ key: "ticket", label: "티켓" },
	{ key: "voice", label: "임시 음성 채널" }
] as const;

type TabKey = (typeof TABS)[number]["key"];

/** 가짜 버튼 — 데모 안에서 눌린 상태만 표현해요 */
function MockButton({ children, pressed }: { children: React.ReactNode; pressed?: boolean }) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-control px-3 py-1.5 text-xs font-semibold transition-colors duration-base",
				pressed ? "bg-primary-control text-primary-control-text" : "bg-discord-btn-active text-discord-text"
			)}
		>
			{children}
		</span>
	);
}

/** 시루 봇 메시지 — 다른 프리뷰와 같은 Discord 메시지 구조(프로필, 이름, 앱 배지, 시간) */
function BotMessage({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex gap-2.5">
			<div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full">
				<Image src="/images/siru-profile.png" alt="시루" fill className="object-cover" sizes="32px" />
			</div>
			<div className="flex min-w-0 flex-1 flex-col gap-2">
				<div className="flex items-center gap-2">
					<span className="text-sm font-semibold text-discord-text">시루</span>
					<span className="rounded-sm bg-discord-primary px-1 py-0.5 text-2xs font-bold leading-none text-primary-control-text">앱</span>
					<span className="text-2xs text-discord-text-muted">오후 8:12</span>
				</div>
				{children}
			</div>
		</div>
	);
}

function RolesPanel({ step }: { step: number }) {
	const roles = ["게임", "음악", "공지 알림"];
	return (
		<BotMessage>
			<div className="space-y-0.5">
				<p className="text-sm font-bold text-discord-text">역할을 골라주세요</p>
				<p className="text-xs text-discord-text-muted">버튼을 누르면 역할이 지급되고, 다시 누르면 해제돼요.</p>
			</div>
			<div className="flex flex-wrap gap-2">
				{roles.map((role, index) => (
					<MockButton key={role} pressed={(index === 1 && step >= 1) || (index === 0 && step >= 2)}>
						{((index === 1 && step >= 1) || (index === 0 && step >= 2)) && <Check size={12} aria-hidden />}
						{role}
					</MockButton>
				))}
			</div>
			<p className={cn("text-2xs text-discord-text-muted transition-opacity duration-base", step >= 1 ? "opacity-100" : "opacity-0")}>
				역할 {step >= 2 ? 2 : 1}개를 가지고 있어요. (나에게만 보이는 메시지)
			</p>
		</BotMessage>
	);
}

function TicketPanel({ step }: { step: number }) {
	return (
		<BotMessage>
			<div className="space-y-0.5">
				<p className="text-sm font-bold text-discord-text">문의가 있나요?</p>
				<p className="text-xs text-discord-text-muted">버튼을 누르면 운영진과 나만 볼 수 있는 문의 채널이 열려요.</p>
			</div>
			<MockButton pressed={step >= 1}>
				<Ticket size={13} aria-hidden />
				티켓 열기
			</MockButton>
			<m.div
				initial={false}
				animate={step >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
				transition={{ duration: motionBase, ease: "easeOut" }}
				className="space-y-0.5 border-l-2 border-discord-primary pl-2.5 text-xs text-discord-text"
			>
				<p className="flex items-center gap-1.5 font-semibold">
					<Lock size={12} aria-hidden className="text-discord-text-muted" />
					티켓 #0012
				</p>
				<p className="text-discord-text-muted">신청자 @서름 · 담당자 미배정</p>
			</m.div>
		</BotMessage>
	);
}

function VoicePanel({ step }: { step: number }) {
	return (
		<div className="space-y-2 text-xs text-discord-text">
			<p className="text-2xs font-bold text-discord-text-muted">음성 채널</p>
			<div className="flex items-center gap-2 rounded-control px-2 py-1.5">
				<Plus size={14} aria-hidden className="text-discord-text-muted" />
				<span className="font-medium">방 만들기</span>
				{step === 0 && <span className="ml-auto text-2xs text-discord-text-muted">여기에 들어가 보세요</span>}
			</div>
			<m.div
				initial={false}
				animate={step >= 1 ? { opacity: 1, height: "auto" } : { opacity: 0, height: 0 }}
				transition={{ duration: motionBase, ease: "easeOut" }}
				className="overflow-hidden"
			>
				<div className="flex items-center gap-2 rounded-control bg-discord-btn-active px-2 py-1.5">
					<Volume2 size={14} aria-hidden className="text-discord-text-muted" />
					<span className="font-medium">서름님의 방</span>
					<span className="ml-auto text-2xs text-discord-text-muted">1명</span>
				</div>
			</m.div>
			<p className={cn("pt-1 text-2xs text-discord-text-muted transition-opacity duration-base", step >= 2 ? "opacity-100" : "opacity-0")}>
				모두 나가면 잠시 뒤 방이 자동으로 사라져요.
			</p>
		</div>
	);
}

/**
 * 서버 운영 프리뷰 — 역할 패널, 티켓, 임시 음성 채널을 탭으로 돌려 보여줘요.
 * 탭마다 짧은 단계(0 → 1 → 2)를 재생하고, 고르면 그 탭에서 멈춰요.
 * 단계가 바뀌어도 프레임 높이는 고정이라 아래 레이아웃이 밀리지 않아요.
 */
export function ServerOpsPreview() {
	const shouldReduce = useReducedMotion();
	const { ref, inView } = useInView({ threshold: 0.3 });
	const [tab, setTab] = useState<TabKey>("roles");
	const [step, setStep] = useState(0);
	const [manual, setManual] = useState(false);

	useEffect(() => {
		if (!inView) return undefined;
		if (shouldReduce) {
			setStep(2);
			return undefined;
		}
		setStep(0);
		const timers = [setTimeout(() => setStep(1), 900), setTimeout(() => setStep(2), 1900)];
		// 직접 고르지 않았다면 다음 탭으로 넘어가요
		if (!manual) {
			timers.push(
				setTimeout(() => {
					setTab((prev) => TABS[(TABS.findIndex((t) => t.key === prev) + 1) % TABS.length].key);
				}, 4800)
			);
		}
		return () => timers.forEach(clearTimeout);
	}, [inView, tab, manual, shouldReduce]);

	return (
		<div ref={ref} className="overflow-hidden rounded-card border border-border-subtle bg-discord-embed">
			<div role="tablist" aria-label="서버 운영 기능" className="flex gap-1 border-b border-discord-btn-active px-2 py-2">
				{TABS.map((item) => (
					<button
						key={item.key}
						type="button"
						role="tab"
						aria-selected={tab === item.key}
						onClick={() => {
							setManual(true);
							setTab(item.key);
						}}
						className={cn(
							"min-h-9 cursor-pointer rounded-control px-2.5 py-1 text-xs font-semibold transition-colors duration-fast",
							tab === item.key ? "bg-discord-btn-active text-discord-text" : "text-discord-text-muted hover:text-discord-text"
						)}
					>
						{item.label}
					</button>
				))}
			</div>
			<div className="relative h-48 px-4 py-4 sm:h-44">
				<AnimatePresence mode="wait" initial={false}>
					<m.div
						key={tab}
						initial={shouldReduce ? false : { opacity: 0, clipPath: "inset(0 0 100% 0)" }}
						animate={{ opacity: 1, clipPath: "inset(0 0 0% 0)" }}
						exit={shouldReduce ? undefined : { opacity: 0, transition: { duration: motionFast } }}
						transition={{ duration: motionBase, ease: "easeOut" }}
					>
						{tab === "roles" && <RolesPanel step={step} />}
						{tab === "ticket" && <TicketPanel step={step} />}
						{tab === "voice" && <VoicePanel step={step} />}
					</m.div>
				</AnimatePresence>
			</div>
		</div>
	);
}
