"use client";

import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

export function PageTransition({ children }: { children: React.ReactNode }) {
	const pathname = usePathname();

	return (
		<AnimatePresence mode="wait">
			<motion.div
				key={pathname}
				initial={{ opacity: 0, y: 5 }}
				animate={{ opacity: 1, y: 0 }}
				exit={{ opacity: 0, y: -5 }}
				transition={{ duration: 0.2, ease: "easeOut" }}
			>
				{children}
			</motion.div>
		</AnimatePresence>
	);
}

