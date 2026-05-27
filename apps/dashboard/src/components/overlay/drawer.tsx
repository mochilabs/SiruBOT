"use client";

import { useCallback, useEffect } from "react";
import { AnimatePresence, m } from "framer-motion";
import { X } from "lucide-react";
import { Portal } from "./portal";

/* ─────────────────────────── types ─────────────────────────── */

interface DrawerProps {
	open: boolean;
	onClose: () => void;
	side?: "left" | "right";
	width?: string;
	title?: string;
	children: React.ReactNode;
	className?: string;
}

/* ─────────────────────────── slide variants ─────────────────────────── */

const slideVariants = {
	left: {
		initial: { x: "-100%" },
		animate: { x: 0 },
		exit: { x: "-100%" },
	},
	right: {
		initial: { x: "100%" },
		animate: { x: 0 },
		exit: { x: "100%" },
	},
};

/* ─────────────────────────── component ─────────────────────────── */

export function Drawer({
	open,
	onClose,
	side = "right",
	width = "w-80",
	title,
	children,
	className = "",
}: DrawerProps) {
	const variants = slideVariants[side];

	const handleEsc = useCallback(
		(e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		},
		[onClose],
	);

	useEffect(() => {
		if (!open) return;
		document.addEventListener("keydown", handleEsc);
		document.body.style.overflow = "hidden";
		return () => {
			document.removeEventListener("keydown", handleEsc);
			document.body.style.overflow = "";
		};
	}, [open, handleEsc]);

	return (
		<Portal>
			<AnimatePresence>
				{open && (
					<div className="fixed inset-0 z-[150] flex">
						{/* Backdrop */}
						<m.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.2 }}
							className="absolute inset-0 bg-black/60 backdrop-blur-sm"
							onClick={onClose}
							aria-hidden
						/>

						{/* Panel */}
						<m.aside
							role="dialog"
							aria-modal="true"
							aria-label={title}
							initial={variants.initial}
							animate={variants.animate}
							exit={variants.exit}
							transition={{ type: "spring", stiffness: 400, damping: 35 }}
							className={`
								relative ${side === "left" ? "mr-auto" : "ml-auto"} ${width}
								h-full bg-card border-${side === "left" ? "r" : "l"} border-border
								flex flex-col shadow-2xl ${className}
							`}
						>
							{/* Header */}
							{title && (
								<div className="flex items-center justify-between px-6 py-4 border-b border-border/40 shrink-0">
									<h2 className="text-lg font-black tracking-tighter text-foreground">
										{title}
									</h2>
									<button
										type="button"
										onClick={onClose}
										className="p-2 rounded-xl hover:bg-foreground/10 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
										aria-label="닫기"
									>
										<X className="h-5 w-5" />
									</button>
								</div>
							)}

							{/* Content */}
							<div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
						</m.aside>
					</div>
				)}
			</AnimatePresence>
		</Portal>
	);
}
