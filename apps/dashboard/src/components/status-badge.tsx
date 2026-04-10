"use client";

import { motion } from "framer-motion";

export function StatusBadge({ status }: { status: string }) {
	const normalized = status.toUpperCase();
	const config: Record<string, { text: string; bg: string; dot: string }> = {
		READY: {
			text: "text-emerald-200",
			bg: "bg-[rgba(16,185,129,0.12)] border-[rgba(16,185,129,0.3)]",
			dot: "bg-emerald-300",
		},
		IDLE: {
			text: "text-amber-200",
			bg: "bg-[rgba(245,158,11,0.14)] border-[rgba(245,158,11,0.3)]",
			dot: "bg-amber-300",
		},
		CONNECTING: {
			text: "text-sky-200",
			bg: "bg-[rgba(59,130,246,0.14)] border-[rgba(59,130,246,0.3)]",
			dot: "bg-sky-300",
		},
		DISCONNECTED: {
			text: "text-rose-200",
			bg: "bg-[rgba(244,63,94,0.14)] border-[rgba(244,63,94,0.3)]",
			dot: "bg-rose-300",
		},
		ERRORED: {
			text: "text-rose-200",
			bg: "bg-[rgba(244,63,94,0.14)] border-[rgba(244,63,94,0.3)]",
			dot: "bg-rose-300",
		},
	};

	const c = config[normalized] ?? config.ERRORED;

	return (
		<span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium ${c.bg} ${c.text}`}>
			<motion.span
				className={`pulse-dot h-1.5 w-1.5 rounded-full ${c.dot}`}
				animate={{ opacity: [0.45, 1, 0.45], scale: [0.88, 1.06, 0.88] }}
				transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
			/>
			{normalized}
		</span>
	);
}
