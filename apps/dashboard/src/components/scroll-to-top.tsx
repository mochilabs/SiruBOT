"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, m, useScroll } from "framer-motion";
import { ArrowUp } from "lucide-react";

export function ScrollToTop() {
	const [isVisible, setIsVisible] = useState(false);

	// 페이지 전체 스크롤 진행률(0→1) — 링 채움량을 그대로 표현한다
	const { scrollYProgress } = useScroll();

	useEffect(() => {
		const toggleVisibility = () => {
			setIsVisible(window.scrollY > 400);
		};

		window.addEventListener("scroll", toggleVisibility, { passive: true });
		return () => window.removeEventListener("scroll", toggleVisibility);
	}, []);

	const scrollToTop = () => {
		window.scrollTo({ top: 0, behavior: "smooth" });
	};

	return (
		// FAB 모서리 여백 — 기본 1.5rem(6), sm 이상 2rem(8)에 iOS safe-area(env)를 더한다(env가 0인 데스크탑은 기존과 동일).
		<AnimatePresence>
			{isVisible && (
				<m.button
					initial={{ opacity: 0, y: 12 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: 12 }}
					transition={{ duration: 0.2, ease: "easeOut" }}
					onClick={scrollToTop}
					className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] right-[calc(1.5rem+env(safe-area-inset-right))] z-40 flex h-11 w-11 items-center justify-center rounded-control border border-border bg-background/70 text-foreground shadow-lg backdrop-blur-xl transition-colors duration-fast hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 sm:bottom-[calc(2rem+env(safe-area-inset-bottom))] sm:right-[calc(2rem+env(safe-area-inset-right))]"
					aria-label="맨 위로 가기"
				>
					<ArrowUp className="h-5 w-5" aria-hidden />

					{/* 스크롤 진행률 링 — 버튼(44px)보다 살짝 큰 50px 원 2겹(트랙 + 진행).
					    위치 정보성 표시라 reduced-motion에서도 유지하며, pointer-events-none으로 클릭을 방해하지 않는다 */}
					<svg viewBox="0 0 44 44" aria-hidden="true" className="pointer-events-none absolute -inset-[3px] -rotate-90">
						{/* 트랙 원(정적) */}
						<circle cx="22" cy="22" r="20" fill="none" strokeWidth="2" className="stroke-border opacity-60" />
						{/* 진행 원(12시 방향 시계 방향) — scrollYProgress를 pathLength로 연동 */}
						<m.circle
							cx="22"
							cy="22"
							r="20"
							fill="none"
							strokeWidth="2"
							strokeLinecap="round"
							className="stroke-primary"
							style={{ pathLength: scrollYProgress }}
						/>
					</svg>
				</m.button>
			)}
		</AnimatePresence>
	);
}