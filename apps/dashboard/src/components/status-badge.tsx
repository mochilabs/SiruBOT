"use client";

export function StatusBadge({ status }: { status: string }) {
	const normalized = status.toUpperCase();
	const config: Record<string, { text: string; bg: string; dot: string }> = {
		READY: {
			text: "text-emerald-600 dark:text-emerald-400",
			bg: "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500/20",
			dot: "bg-emerald-500",
		},
		IDLE: {
			text: "text-amber-600 dark:text-amber-400",
			bg: "bg-amber-50 dark:bg-amber-500/10 border-amber-500/20",
			dot: "bg-amber-500",
		},
		CONNECTING: {
			text: "text-sky-600 dark:text-sky-400",
			bg: "bg-sky-50 dark:bg-sky-500/10 border-sky-500/20",
			dot: "bg-sky-500",
		},
		DISCONNECTED: {
			text: "text-rose-600 dark:text-rose-400",
			bg: "bg-rose-50 dark:bg-rose-500/10 border-rose-500/20",
			dot: "bg-rose-500",
		},
		ERRORED: {
			text: "text-rose-600 dark:text-rose-400",
			bg: "bg-rose-50 dark:bg-rose-500/10 border-rose-500/20",
			dot: "bg-rose-500",
		},
	};

	const c = config[normalized] ?? config.ERRORED;

	return (
		<span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium ${c.bg} ${c.text}`}>
			<span className={`animate-pulse-soft h-1.5 w-1.5 rounded-full ${c.dot}`} />
			{normalized}
		</span>
	);
}
