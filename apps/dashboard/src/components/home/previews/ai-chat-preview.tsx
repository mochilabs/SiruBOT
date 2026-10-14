"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, m } from "framer-motion";
import { Bot, Brain, CloudSun, Music2 } from "lucide-react";

import { StreamingTypeText } from "@/components/streaming-type-text";
import { TypingText } from "@/components/typing-text";
import { cn } from "@/lib/utils";

/** AI 채팅 데모가 순환하는 도구 3종 — 봇의 실제 도구(음악 제어·생활 정보·장기 기억) */
const utilities = [
	{
		icon: Music2,
		title: "음악 재생",
		desc: "\"노래 틀어줘\" 한마디로 대기열에 추가해요.",
		prompt: "즛토마요 노래 틀어줘",
		status: "시루가 음악을 찾는 중..",
		reply: "즛토마요 노래를 대기열에 추가했어요. 지금 음성 채널에서 재생 중이에요.",
	},
	{
		icon: CloudSun,
		title: "생활 정보",
		desc: "/날씨 · /택배 · 오늘의 운세까지 챙겨드려요.",
		prompt: "내일 아침 비 와?",
		status: "시루가 날씨를 확인하는 중..",
		reply: "내일 서울은 이슬비 소식이 있고, 강수확률이 92%로 매우 높아요!",
	},
	{
		icon: Brain,
		title: "장기 기억",
		desc: "시루가 사용자님의 취향을 기억해요.",
		prompt: "난 햄버거가 좋아 기억해줘",
		status: "시루가 메모리를 업데이트 하는중",
		reply: "알겠어! 햄버거 좋아하는구나? 딱 기억해둘게! 🍔",
	},
];

/**
 * /채팅 — 도구 3종을 순환: 사용자 타이핑 → 시루가 생각 중.. → 답변 타이핑
 *
 * 시퀀스는 절대 배치 레이어에 담아 본문 높이를 고정하고, 단계 전환은 이동 없는 페이드만으로
 * 처리해요 — 도구가 바뀌거나 답변이 길어져도 푸터·아래 레이아웃이 밀리지 않아요.
 */
function ChatPreview() {
	const [activeTool, setActiveTool] = useState(0);
	/** 0: 사용자 타이핑 중, 1: 봇 생각 중, 2: 답변 타이핑 */
	const [phase, setPhase] = useState(0);
	/** 다음 도구로 넘어가기 전 대기용 타이머 — 사용자가 탭 바꾸면 취소해야 함 */
	const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const current = utilities[activeTool];

	const clearAdvanceTimer = () => {
		if (advanceTimerRef.current) {
			clearTimeout(advanceTimerRef.current);
			advanceTimerRef.current = null;
		}
	};

	useEffect(() => clearAdvanceTimer, []);

	// 시퀀스: 사용자 타이핑 완료 → 생각 중 → 답변 타이핑 완료 → 다음 도구 (타이핑 종료 이벤트 기반)
	useEffect(() => {
		// reduced-motion에선 정적 답변을 바로 보여요
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			setPhase(2);
			return undefined;
		}
		if (phase === 0) {
			const timer = setTimeout(() => setPhase(1), 2100);
			return () => clearTimeout(timer);
		}
		if (phase === 1) {
			// 생각 중 표시 후 답변 타이핑으로 전환
			const timer = setTimeout(() => setPhase(2), 1200);
			return () => clearTimeout(timer);
		}
		return undefined;
	}, [phase, activeTool]);

	const advanceTool = () => {
		// 답변이 다 쳐지고 나서 몇 초간 읽을 시간을 준 뒤 다음 도구로 넘어가요
		clearAdvanceTimer();
		advanceTimerRef.current = setTimeout(() => {
			setActiveTool((prev) => (prev + 1) % utilities.length);
			setPhase(0);
		}, 2400);
	};

	const selectTool = (index: number) => {
		clearAdvanceTimer();
		setActiveTool(index);
		setPhase(0);
	};

	return (
		<div className="flex flex-col gap-3 p-3 sm:p-4">
			{/* 도구 인디케이터 */}
			<div className="flex items-center justify-between gap-2" role="tablist" aria-label="도구 예시">
				<p className="text-2xs font-semibold uppercase tracking-widest text-discord-text-muted">도구 예시</p>
				<div className="flex items-center gap-1.5">
					{utilities.map((utility, index) => (
						<button
							key={utility.title}
							type="button"
							role="tab"
							aria-selected={activeTool === index}
							aria-label={utility.title}
							onClick={() => selectTool(index)}
							className="group flex h-4 w-4 cursor-pointer items-center justify-center"
						>
							<span
								className={cn(
									"rounded-full transition-all duration-base",
									activeTool === index ? "h-2 w-2 bg-primary-control" : "h-1.5 w-1.5 bg-discord-btn-active group-hover:bg-discord-text-muted",
								)}
							/>
						</button>
					))}
				</div>
			</div>

			{/* 본문 높이는 이 컨테이너의 고정값 — 봇 메시지가 절대 배치라 도구가 바뀌어도 아래가 밀리지 않아요 */}
			<div className="relative min-h-[150px] flex-1 overflow-hidden">
				<AnimatePresence mode="wait" initial={false}>
					<m.div
						key={current.title}
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.25, ease: "easeOut" }}
						className="absolute inset-x-0 top-2 space-y-3"
					>
						{/* 1단계 — 사용자: 멘션 + 프롬프트 타이핑 */}
						<div className="flex gap-2.5">
							<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-discord-btn-active text-2xs font-bold text-discord-text">사</div>
							<div className="min-w-0 flex-1">
								<div className="flex items-baseline gap-2">
									<span className="text-sm font-semibold text-discord-text">사용자</span>
									<span className="text-2xs text-discord-text-muted">오후 8:11</span>
								</div>
								<p className="mt-1 flex flex-wrap items-center text-sm text-discord-text">
									<span className="mr-1 shrink-0 rounded-sm bg-discord-primary/20 px-1 text-discord-light">@시루</span>
									{phase === 0 ? (
										<TypingText key={`prompt-${current.title}`} texts={[current.prompt]} speed={70} className="min-w-0" />
									) : (
										<span className="min-w-0">{current.prompt}</span>
									)}
								</p>
							</div>
						</div>

						{/* 2·3단계 — 봇: 시루 프로필 + 이름/앱 배지/시간 → 생각 중 → 답변 타이핑 (히어로 카드와 같은 Discord 메시지 구조) */}
						{phase > 0 && (
							<m.div
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								transition={{ duration: 0.3, ease: "easeOut" }}
								className="flex gap-2.5"
							>
								<div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full">
									<Image src="/images/profile.png" alt="시루" fill className="object-cover" sizes="32px" />
								</div>
								<div className="flex min-w-0 flex-1 flex-col gap-1">
									<div className="flex items-center gap-2">
										<span className="text-sm font-semibold text-discord-text">시루</span>
										<span className="rounded-sm bg-discord-primary px-1 py-0.5 text-2xs font-bold leading-none text-primary-control-text">앱</span>
										<span className="text-2xs text-discord-text-muted">오후 8:12</span>
									</div>
									<AnimatePresence mode="wait" initial={false}>
										{phase === 1 ? (
											<m.p
												key="thinking"
												initial={{ opacity: 0 }}
												animate={{ opacity: 1 }}
												exit={{ opacity: 0 }}
												transition={{ duration: 0.2 }}
												className="flex items-center gap-1.5 text-2xs font-medium text-discord-text-muted"
											>
												시루가 생각 중
												<span className="flex gap-0.5" aria-hidden>
													{[0, 1, 2].map((dot) => (
														<m.span
															key={dot}
															className="h-1 w-1 rounded-full bg-discord-text-muted"
															animate={{ opacity: [0.3, 1, 0.3] }}
															transition={{ duration: 1, repeat: Infinity, delay: dot * 0.2 }}
														/>
													))}
												</span>
											</m.p>
										) : (
											<m.div
												key="reply"
												initial={{ opacity: 0 }}
												animate={{ opacity: 1 }}
												transition={{ duration: 0.2 }}
											>
												<p className="mb-1 text-2xs font-medium text-discord-text-muted">
													{current.status} (완료)
												</p>
												<p className="text-sm leading-relaxed text-discord-text">
													<StreamingTypeText key={`reply-${current.title}`} text={current.reply} speed={40} onComplete={advanceTool} />
												</p>
											</m.div>
										)}
									</AnimatePresence>
								</div>
							</m.div>
						)}
					</m.div>
				</AnimatePresence>
			</div>
		</div>
	);
}

/** AI 채팅 프리뷰 — Discord 채널 프레임(헤더·푸터) 안에 타이핑 시뮬레이션을 담아요 */
export function AiChatPreview() {
	return (
		<div className="flex min-w-0 flex-col overflow-hidden rounded-card bg-discord-embed">
			<div className="flex items-center gap-2 border-b border-discord-btn-active px-4 py-2.5">
				<Bot size={14} className="text-discord-text-muted" aria-hidden />
				<span className="text-xs font-semibold text-discord-text">ai-라운지</span>
				<span className="ml-auto text-2xs text-discord-text-muted">시루 · 멘션 응답</span>
			</div>
			<ChatPreview />
			<p className="border-t border-discord-btn-active px-4 py-2 text-2xs text-discord-text-muted">@시루 멘션으로 말 걸면 도구를 골라 써요.</p>
		</div>
	);
}