"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname, useSearchParams } from "next/navigation";

export function PageTransition({ children }: { children: React.ReactNode }) {
	const pathname = usePathname();

	return (
		<AnimatePresence mode="wait" initial={true}>
			<motion.div
				key={pathname}
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				exit={{ opacity: 0 }}
				transition={{ duration: 0.2, ease: "easeInOut" }}
			>
				{children}
			</motion.div>
		</AnimatePresence>
	);
}

