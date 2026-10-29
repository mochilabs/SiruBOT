"use client";

import { useEffect, useRef, useState } from "react";
import { useInView } from "react-intersection-observer";
import Image from "next/image";
import { Volume2 } from "lucide-react";

import { StreamingTypeText } from "@/components/streaming-type-text";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/** 채팅 읽기 시퀀스 데모 — 채팅이 타이핑되어 올라오면 시루가 곧바로 TTS 목소리로 읽어줘요 */
const CHAT_MESSAGES = [
	{ author: "서름", time: "오후 8:11", text: "여기 후렴 미쳤다 ㅋㅋ" },
	{ author: "미니", time: "오후 8:12", text: "노래 좋은데? 누가 골랐어?" },
	{ author: "서름", time: "오후 8:13", text: "지금 이 부분 진짜 좋다" }
];

const SPEAK_MS = 1800;
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
	/** 0~2: 현재 활성 채팅 행 인덱스 */
	const [activeIdx, setActiveIdx] = useState(0);
	/** "typing": 유저가 채팅을 입력 중, "speaking": 시루가 음성으로 읽는 중 */
	const [phase, setPhase] = useState<"typing" | "speaking">("typing");
	const [reduceMotion, setReduceMotion] = useState(false);
	const speakTimerRef = useRef<number | null>(null);

	useEffect(() => {
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			setReduceMotion(true);
			setActiveIdx(CHAT_MESSAGES.length - 1);
			setPhase("speaking");
		}
	}, []);

	useEffect(() => {
		if (!inView || !ttsOn || reduceMotion) return undefined;
		if (phase !== "speaking") return undefined;

		const isLast = activeIdx >= CHAT_MESSAGES.length - 1;
		speakTimerRef.current = window.setTimeout(
			() => {
				setActiveIdx(isLast ? 0 : activeIdx + 1);
				setPhase("typing");
			},
			isLast ? SPEAK_MS + 600 : SPEAK_MS,
		);
		return () => {
			if (speakTimerRef.current !== null) {
				window.clearTimeout(speakTimerRef.current);
				speakTimerRef.current = null;
			}
		};
	}, [inView, ttsOn, phase, activeIdx, reduceMotion]);

	const isReading = ttsOn && phase === "speaking";
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
							<span className="rounded-sm bg-discord-primary px-1 py-0.5 text-2xs font-bold leading-none text-white">앱</span>
							<span className={cn("ml-auto shrink-0 text-2xs font-medium transition-colors duration-fast", isReading ? "text-discord-voice font-bold" : "text-discord-text-muted")}>
								{isReading ? "채팅 읽는 중 · 노래 재생 중" : "노래 재생 중"}
							</span>
						</div>
						<div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-discord-btn-active" aria-hidden>
							<div className={cn("h-full rounded-full bg-discord-voice transition-all duration-base", isReading ? "w-[68%]" : "w-[28%]")} />
						</div>
					</div>
				</div>
				{/* 읽혀야 할 채팅 — 항상 전부 렌더되고 상태만 순서대로 켜져요 */}
				<ul className="flex flex-col gap-1">
					{CHAT_MESSAGES.map((message, index) => {
						const isCurrent = index === activeIdx;
						const typing = ttsOn && !reduceMotion && isCurrent && phase === "typing";
						const reading = ttsOn && isCurrent && phase === "speaking";
						const read = ttsOn && index < activeIdx;
						const pending = ttsOn && !reduceMotion && index > activeIdx;
						return (
							<li
								key={`${message.author}${message.text}`}
								className={cn(
									"flex gap-2.5 rounded-control px-2.5 py-2 transition-all duration-fast",
									reading && "bg-discord-btn-active/45 ring-1 ring-inset ring-primary-control/30",
									typing && "bg-discord-btn-active/20",
									pending && "opacity-40",
								)}
							>
								<span
									aria-hidden
									className={cn(
										"mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-2xs font-bold transition-colors duration-fast",
										reading ? "bg-discord-primary text-white" : typing ? "bg-discord-btn-active text-discord-text" : "bg-discord-btn-active text-discord-text-muted",
									)}
								>
									{message.author.charAt(0)}
								</span>
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2">
										<span className="text-sm font-semibold text-discord-text">{message.author}</span>
										<span className="text-2xs text-discord-text-muted">{message.time}</span>
										<span
											aria-hidden={!typing && !reading && !read}
											className={cn(
												"ml-auto shrink-0 text-2xs font-bold transition-colors duration-fast",
												reading
													? "inline-flex items-center gap-1 rounded-full bg-primary-control/15 px-2 py-0.5 text-primary-text"
													: typing
														? "text-discord-light"
														: "text-discord-text-muted",
												!typing && !reading && !read && "text-transparent select-none",
											)}
										>
											{reading && <Volume2 size={11} className="animate-pulse" aria-hidden />}
											{reading ? "읽는 중" : typing ? "입력 중…" : "읽었어요"}
										</span>
									</div>
									<p className={cn("mt-0.5 break-words text-sm leading-relaxed", (reading || typing) ? "font-medium text-discord-text" : "text-discord-text-muted")}>
										{typing && inView ? (
											<StreamingTypeText
												key={`tts-msg-${activeIdx}`}
												text={message.text}
												speed={42}
												onComplete={() => setPhase("speaking")}
											/>
										) : (
											message.text
										)}
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