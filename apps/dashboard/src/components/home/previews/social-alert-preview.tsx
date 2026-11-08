"use client";

import { m, useReducedMotion } from "framer-motion";
import { CirclePlay, Radio, Tv } from "lucide-react";

import { motionSlow } from "@/components/motion/durations";

/** 알림 한 건 — 예시 채널 이름이라 실제 방송인과 무관해요 */
const ALERTS = [
	{ icon: CirclePlay, platform: "YouTube", title: "새 영상이 올라왔어요", detail: "봄 산책 브이로그 #12", live: false },
	{ icon: Radio, platform: "Twitch", title: "방송을 시작했어요", detail: "오늘은 느긋하게 퍼즐 게임", live: true },
	{ icon: Tv, platform: "Chzzk", title: "방송을 시작했어요", detail: "저녁 수다 방송", live: true }
] as const;

/**
 * SNS 알림 프리뷰 — notifier가 YouTube·Twitch·Chzzk를 확인하다 새 소식이 생기면 웹훅으로 채널에 보내요.
 * 카드는 위에서부터 클립 와이프로 차례로 열려요. 웹훅 연결은 대시보드에서 해요.
 */
export function SocialAlertPreview() {
	const shouldReduce = useReducedMotion();
	return (
		<div className="overflow-hidden rounded-card border border-border-subtle bg-discord-embed">
			<div className="flex items-center gap-2 border-b border-discord-btn-active px-4 py-2.5">
				<span className="text-xs font-semibold text-discord-text"># 소식-알림</span>
				<span className="ml-auto text-2xs text-discord-text-muted">시루 · 웹훅</span>
			</div>
			<m.ul
				className="space-y-3 p-4"
				variants={{ hidden: {}, visible: { transition: { staggerChildren: shouldReduce ? 0 : 0.18 } } }}
				initial="hidden"
				whileInView="visible"
				viewport={{ once: true, margin: "-60px" }}
			>
				{ALERTS.map((alert) => (
					<m.li
						key={alert.platform}
						variants={{
							hidden: shouldReduce ? { opacity: 1 } : { opacity: 0, clipPath: "inset(0 100% 0 0)" },
							visible: { opacity: 1, clipPath: "inset(0 0% 0 0)", transition: { duration: motionSlow, ease: "easeOut" } }
						}}
						className="flex items-start gap-3 rounded-control bg-surface-2/10 p-3"
					>
						<span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-discord-btn-active text-discord-text">
							<alert.icon size={16} aria-hidden />
						</span>
						<div className="min-w-0 flex-1">
							<p className="flex items-center gap-2 text-2xs font-bold text-discord-text-muted">
								{alert.platform}
								{alert.live && (
									<span className="inline-flex items-center gap-1 text-destructive">
										<span aria-hidden className="size-1.5 rounded-full bg-destructive" />
										LIVE
									</span>
								)}
							</p>
							<p className="text-sm font-semibold text-discord-text">{alert.title}</p>
							<p className="truncate text-xs text-discord-text-muted">{alert.detail}</p>
						</div>
					</m.li>
				))}
			</m.ul>
		</div>
	);
}
