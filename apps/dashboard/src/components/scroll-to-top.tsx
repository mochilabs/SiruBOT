"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { ArrowUp } from "lucide-react";

import { motionFast } from "@/components/motion/durations";
import { useHasUnsavedActiveSettings } from "@/components/servers/settings-shared";

export function ScrollToTop() {
	const [isVisible, setIsVisible] = useState(false);
	const saveBarActive = useHasUnsavedActiveSettings();

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
		<AnimatePresence>
			{isVisible && !saveBarActive && (
				<m.button
					initial={{ opacity: 0, y: 12 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: 12 }}
					transition={{ duration: motionFast, ease: "easeOut" }}
					onClick={scrollToTop}
					// 모바일은 하단 탭 바가 있고, 그 위에 떠 있으면 카드 오른쪽 끝을 계속 가려서 md부터만 보여요
					className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-[calc(1rem+env(safe-area-inset-right))] z-(--z-float) hidden h-11 w-11 items-center justify-center rounded-control bg-background/70 text-foreground shadow-lg backdrop-blur-xl transition-colors duration-fast hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:flex md:bottom-[calc(2rem+env(safe-area-inset-bottom))] md:right-[calc(2rem+env(safe-area-inset-right))]"
					aria-label="맨 위로 가기"
				>
					<ArrowUp className="h-5 w-5" aria-hidden />
				</m.button>
			)}
		</AnimatePresence>
	);
}