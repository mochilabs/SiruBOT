"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, m } from "framer-motion";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/** 프리셋 닉네임 — 실제 기능은 봇의 botProfileService: 저장하면 discord.js editMe로 길드 전용 프로필에 적용돼요 */
const NICKNAME_PRESETS = ["시루봇", "DJ 시루", "라운지 관리사 시루"];

/** 봇 프로필 프리뷰 — 닉네임을 바꾸면 저장 토스트("봇에 바로 반영")로 즉시 반영을 보여줘요 */
export function BotProfilePreview() {
	const [nickname, setNickname] = useState("시루봇");
	/** 토스트 키 — 이미 열려 있어도 클릭마다 키를 갱신해 다시 띄워요 */
	const [applyCount, setApplyCount] = useState(0);
	const [toastVisible, setToastVisible] = useState(false);
	const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// 언마운트 시 닫힘 타이머 정리
	useEffect(
		() => () => {
			if (hideTimerRef.current) {
				clearTimeout(hideTimerRef.current);
				hideTimerRef.current = null;
			}
		},
		[],
	);

	const applyName = (name: string) => {
		setNickname(name);
		setApplyCount((count) => count + 1);
		setToastVisible(true);
		// 이미 열려 있어도 표시 시간을 다시 셌요
		if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
		hideTimerRef.current = setTimeout(() => {
			setToastVisible(false);
			hideTimerRef.current = null;
		}, 2000);
	};

	return (
		<div className="relative pb-10 pr-2">
			<div className="overflow-hidden rounded-card bg-surface-1 shadow-md">
				<div className="h-16 bg-gradient-to-r from-primary/50 via-primary-control/40 to-primary/50" />
				<div className="relative ml-4 -mt-7 h-14 w-14 overflow-hidden rounded-full ring-4 ring-surface-1">
					<Image src="/images/profile.png" alt="시루" fill className="object-cover" sizes="56px" />
				</div>
				<div className="flex min-w-0 flex-col gap-1 p-4 pt-2">
					<p className="truncate text-lg font-black tracking-tighter text-foreground">{nickname}</p>
					<div className="flex items-center gap-2">
						<span className="h-2 w-2 rounded-full bg-success" aria-hidden />
						<span className="text-2xs text-muted-foreground">온라인</span>
						<span className="rounded-sm bg-discord-primary px-1 py-0.5 text-2xs font-bold leading-none text-primary-control-text">앱</span>
						<span className="text-2xs text-muted-foreground">shirubot</span>
					</div>
				</div>
				<p className="border-t border-border-subtle px-4 py-2 text-2xs text-muted-foreground">이 길드에만 적용된 프로필이에요.</p>
			</div>
			<div className="mt-3 rounded-card bg-surface-2 p-3">
				<p className="text-2xs font-medium text-muted-foreground">길드 닉네임</p>
				<div className="mt-2 flex flex-wrap gap-1.5">
					{NICKNAME_PRESETS.map((name) => (
						<button
							key={name}
							type="button"
							onClick={() => applyName(name)}
							className={cn(
								"cursor-pointer rounded-control px-2.5 py-1.5 text-xs font-bold transition-colors duration-fast",
								nickname === name
									? "bg-primary/10 text-primary-text"
									: "bg-surface-1 text-muted-foreground hover:bg-surface-3 hover:text-foreground",
							)}
						>
							{name}
						</button>
					))}
				</div>
			</div>
			<AnimatePresence>
				{toastVisible && (
					<m.div
						key={applyCount}
						className="absolute bottom-0 right-3 flex items-center gap-1.5 rounded-card border border-success/20 bg-success/10 px-3 py-2 text-xs font-bold text-success shadow-lg"
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.25, ease: "easeOut" }}
					>
						<Check size={13} className="shrink-0" aria-hidden />
						저장됨 · 봇에 바로 반영
					</m.div>
				)}
			</AnimatePresence>
		</div>
	);
}