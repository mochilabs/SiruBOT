"use client";

import { useEffect, useState } from "react";
import { useInView } from "react-intersection-observer";
import { Volume2 } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/** 채팅 읽기 시퀀스 데모 — 봇이 구현되면 이 흐름(채팅 수신 → TTS로 읽고 → 다음)이 실제로 돌아가요 */
const CHAT_MESSAGES = [
	{ author: "서름", text: "다들 이 구간 듣고 싶다?" },
	{ author: "미니", text: "노래 좋은데? 누가 골랐어?" },
	{ author: "서름", text: "지금 이 부분 진짜 좋다" }
];

const CHAT_STEP_MS = 2200;

/**
 * 채팅 TTS 프리뷰(mockup) — 음성 채널에서 노래를 재생하며 채팅을 한 줄씩 읽는 모습.
 * 행은 처음부터 전부 렌더되고 상태 표시(읽는 중/읽었어요)만 순서대로 켜져서
 * 아래 레이아웃이 밀리지 않아요. 스위치를 끄면 읽기를 멈춰요.
 */
export function ChatTtsPreview() {
	const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.3 });
	const [ttsOn, setTtsOn] = useState(true);
	/** -1: 대기(아무것도 안 읽음), 0~2: 읽는 중인 채팅 행 */
	const [step, setStep] = useState(-1);

	useEffect(() => {
		if (!inView || !ttsOn) return undefined;
		if (step === -1) {
			const timer = setTimeout(() => setStep(0), 800);
			return () => clearTimeout(timer);
		}
		const isLast = step >= CHAT_MESSAGES.length - 1;
		const timer = setTimeout(
			() => setStep(isLast ? -1 : step + 1),
			// 마지막 줄까지 읽으면 잠깐 쉬었다 다음 사이클로
			isLast ? CHAT_STEP_MS + 600 : CHAT_STEP_MS,
		);
		return () => clearTimeout(timer);
	}, [inView, step, ttsOn]);

	return (
		<div ref={ref} className="flex flex-col gap-2.5 rounded-card bg-discord-embed p-3 sm:p-4">
			{/* 재생 중인 노래 — 채팅 TTS는 재생 중에 함께 켜둘 수 있어요 */}
			<div className="flex items-center gap-2 rounded-control bg-discord-btn-active/60 px-2.5 py-1.5">
				<Volume2 size={12} className="shrink-0 text-discord-text-muted" aria-hidden />
				<span className="min-w-0 flex-1 truncate text-2xs font-semibold text-discord-text">노래 재생 중</span>
				<div className="relative hidden h-1 w-20 shrink-0 overflow-hidden rounded-full bg-discord-btn-active sm:block" aria-hidden>
					<div className="absolute inset-y-0 left-0 w-[28%] rounded-full bg-primary-control" />
				</div>
			</div>

			{/* 읽혀야 할 채팅 행 — 항상 고정 높이, 상태만 순서대로 켜져요 */}
			<div className="space-y-1.5">
				{CHAT_MESSAGES.map((message, index) => {
					const isReading = step === index;
					const isRead = step === -1 ? false : index < step;
					return (
						<div
							key={`${message.author}${message.text}`}
							className={cn(
								"flex min-w-0 items-center gap-2 rounded-control px-2.5 py-1.5 transition-colors duration-fast",
								isReading ? "bg-surface-1" : "bg-discord-btn-active/60",
							)}
						>
							<span
								className={cn(
									"flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-2xs font-bold",
									isReading ? "bg-discord-primary text-primary-control-text" : "bg-discord-btn-active text-discord-text-muted",
								)}
								aria-hidden
							>
								{message.author.charAt(0)}
							</span>
							<span className={cn("shrink-0 text-2xs font-bold", isReading ? "text-discord-text" : "text-discord-text-muted")}>{message.author}</span>
							<span className={cn("min-w-0 flex-1 truncate text-xs", isReading ? "font-semibold text-discord-text" : "text-discord-text-muted")}>
								{message.text}
							</span>
							<span
								aria-hidden={!isReading && !isRead}
								className={cn(
									"flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-0.5 text-2xs font-bold transition-colors duration-fast",
									isReading ? "bg-primary/10 text-primary-text" : isRead ? "bg-surface-2 text-muted-foreground" : "bg-transparent text-transparent",
								)}
							>
								<Volume2 size={10} aria-hidden />
								{isReading ? "읽는 중" : "읽었어요"}
							</span>
						</div>
					);
				})}
			</div>

			{/* 스위치 — 실제 기능 자리에 마련된 켜기/끄기. 노래를 재생하면서 함께 켜둬요 */}
			<div className="flex items-center justify-between gap-3 rounded-control bg-surface-1 px-3 py-2">
				<div className="min-w-0">
					<p className="truncate text-sm font-medium text-foreground">채팅 읽어주기</p>
					<p className="text-2xs text-muted-foreground">노래를 재생하면서 함께 켜둘 수 있어요</p>
				</div>
				<Switch size="sm" checked={ttsOn} onChange={setTtsOn} aria-label="채팅 읽어주기" />
			</div>
		</div>
	);
}