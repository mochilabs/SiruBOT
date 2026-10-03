"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { ArrowUp } from "lucide-react";

export function ScrollToTop() {
	const [isVisible, setIsVisible] = useState(false);

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
			{isVisible && (
				<m.button
					initial={{ opacity: 0, y: 12 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: 12 }}
					transition={{ duration: 0.2, ease: "easeOut" }}
					onClick={scrollToTop}
					className="fixed bottom-6 right-6 z-40 flex h-11 w-11 items-center justify-center rounded-control border border-border bg-background/70 text-foreground shadow-lg backdrop-blur-xl transition-colors duration-fast hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 sm:bottom-8 sm:right-8"
					aria-label="맨 위로 가기"
				>
					<ArrowUp className="h-5 w-5" aria-hidden />
				</m.button>
			)}
		</AnimatePresence>
	);
}