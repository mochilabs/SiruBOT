"use client";

import { AnimatePresence,motion } from "framer-motion";
import { ArrowUp } from "lucide-react";

import { useUIStore } from "@/store/use-ui-store";

export function ScrollToTop() {
	const isVisible = useUIStore((s) => s.scrollTopVisible);

	const scrollToTop = () => {
		window.scrollTo({
			top: 0,
			behavior: "smooth",
		});
	};

	return (
		<AnimatePresence>
			{isVisible && (
				<motion.button
					initial={{ opacity: 0, scale: 0.5, y: 20 }}
					animate={{ opacity: 1, scale: 1, y: 0 }}
					exit={{ opacity: 0, scale: 0.5, y: 20 }}
					whileHover={{ scale: 1.1 }}
					whileTap={{ scale: 0.9 }}
					onClick={scrollToTop}
					className="fixed bottom-8 right-8 z-[100] p-4 bg-primary/20 backdrop-blur-xl border border-primary/30 text-primary rounded-2xl shadow-2xl shadow-primary/20 hover:bg-primary/30 transition-colors group"
					aria-label="맨 위로 가기"
				>
					<ArrowUp className="h-6 w-6 transition-transform group-hover:-translate-y-1" />
					
					{/* Particle-like glow effect */}
					<div className="absolute inset-0 bg-primary/10 rounded-2xl blur-xl group-hover:bg-primary/20 transition-all -z-10" />
				</motion.button>
			)}
		</AnimatePresence>
	);
}
