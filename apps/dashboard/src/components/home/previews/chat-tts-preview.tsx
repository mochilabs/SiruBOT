"use client";

import { useEffect, useState } from "react";
import { useInView } from "react-intersection-observer";
import Image from "next/image";
import { Volume2 } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/** 채팅 읽기 시퀀스 데모 — 봇이 구현되면 이 흐름(채팅 수신 → TTS로 읽고 → 다음)이 실제로 돌아가요 */
const CHAT_MESSAGES = [
	{ author: "서름", time: "오후 8:11", text: "여기 후렴 미쳤다 ㅋㅋ" },
	{ author: "미니", time: "오후 8:12", text: "노래 좋은데? 누가 골랐어?" },
	{ author: "서름", time: "오후 8:13", text: "지금 이 부분 진짜 좋다" }
];

const CHAT_STEP_MS = 2200;

/**
 * 채팅 TTS 프리뷰(mockup) — 음성 채널에 시루가 참여해 노래를 틀다가, 채팅이 오면 한 줄씩 읽어요.
 * Discord 채널 프레임(헤더·푸터) 안에 음성 참가 패널과 채팅이 있고, 시루 아바타의
 * 초록 링(음성 연결 상태)이 읽는 동안 숨 쉬듯 밝아져요.
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

	const isReading = step >= 0;

	return (
		<div ref={ref} className="flex min-w-0 flex-col overflow-hidden rounded-card bg-discord-embed">
			{/* 채널 헤더 — 음성 채널 */}
			<div className="flex items-center gap-2 border-b border-discord-btn-active px-4 py-2.5">
				<Volume2 size={14} className="shrink-0 text-discord-text-muted" aria-hidden />
				<span className="min-w-0 truncate text-xs font-semibold text-discord-text">음악 감상방</span>
				<span className="ml-auto shrink-0 text-2xs text-discord-text-muted">시루 · 채팅 읽어주기</span>
			</div>

			<div className="flex flex-col gap-3 p-3 sm:p-4">
				{/* 음성 참가 패널 — 노래를 틀면서 대기 중. 읽는 동안 초록 링이 숨 쉬어요 */}
				<div className="flex items-center gap-2.5 rounded-control bg-discord-bg px-2.5 py-2">
					<span className="relative h-8 w-8 shrink-0">
						<span
							aria-hidden
							className={cn(
								"absolute -inset-1 rounded-full border-2 border-discord-voice",
								isReading ? "animate-pulse-soft" : "opacity-70",
							)}
						/>
						<span className="absolute inset-0 overflow-hidden rounded-full">
							<Image src="/images/profile.png" alt="시루" fill className="object-cover" sizes="32px" />
						</span>
					</span>
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-1.5">
							<span className="truncate text-sm font-semibold text-discord-text">시루</span>
							<span className="rounded-sm bg-discord-primary px-1 py-0.5 text-2xs font-bold leading-none text-primary-control-text">앱</span>
							<span className="ml-auto shrink-0 text-2xs font-medium text-discord-text-muted">노래 재생 중</span>
						</div>
						<div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-discord-btn-active" aria-hidden>
							<div className="h-full w-[28%] rounded-full bg-discord-voice" />
						</div>
					</div>
				</div>

				{/* 읽혀야 할 채팅 — 항상 전부 렌더되고 상태만 순서대로 켜져요 */}
				<ul className="flex flex-col gap-1">
					{CHAT_MESSAGES.map((message, index) => {
						const reading = step === index;
						const read = step === -1 ? false : index < step;
						return (
							<li
								key={`${message.author}${message.text}`}
								className={cn(
									"flex gap-2.5 rounded-control px-2 py-1.5 transition-colors duration-fast",
									reading && "bg-discord-btn-active/40",
								)}
							>
								<span
									aria-hidden
									className={cn(
										"mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-2xs font-bold",
										reading ? "bg-discord-primary text-primary-control-text" : "bg-discord-btn-active text-discord-text-muted",
									)}
								>
									{message.author.charAt(0)}
								</span>
								<div className="min-w-0 flex-1">
									<div className="flex items-baseline gap-2">
										<span className="text-sm font-semibold text-discord-text">{message.author}</span>
										<span className="text-2xs text-discord-text-muted">{message.time}</span>
										<span
											aria-hidden={!reading && !read}
											className={cn(
												"ml-auto shrink-0 text-2xs font-bold transition-colors duration-fast",
												reading ? "flex items-center gap-1 text-primary-text" : "text-discord-text-muted",
												!reading && !read && "text-transparent",
											)}
										>
											{reading && <Volume2 size={10} aria-hidden />}
											{reading ? "읽는 중" : "읽었어요"}
										</span>
									</div>
									<p className={cn("mt-0.5 break-words text-sm leading-relaxed", reading ? "font-medium text-discord-text" : "text-discord-text-muted")}>
										{message.text}
									</p>
								</div>
							</li>
						);
					})}
				</ul>
			</div>

			{/* 푸터 — 실제 기능 자리의 스위치. 켜두면 새 채팅을 순서대로 읽어요 */}
			<div className="flex items-center justify-between gap-3 border-t border-discord-btn-active px-4 py-3">
				<div className="min-w-0">
					<p className="truncate text-sm font-medium text-discord-text">채팅 읽어주기</p>
					<p className="text-2xs text-discord-text-muted">켜두면 새 채팅을 순서대로 읽어줘요</p>
				</div>
				<Switch size="sm" checked={ttsOn} onChange={setTtsOn} aria-label="채팅 읽어주기" />
			</div>
		</div>
	);
}