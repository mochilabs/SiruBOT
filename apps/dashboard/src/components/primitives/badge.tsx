"use client";

/* ─────────────────────────── types ─────────────────────────── */

type BadgeVariant = "default" | "primary" | "success" | "warning" | "danger" | "info" | "discord";
type BadgeSize = "sm" | "md";

interface BadgeProps {
	variant?: BadgeVariant;
	size?: BadgeSize;
	dot?: boolean;
	dismissible?: boolean;
	onDismiss?: () => void;
	children: React.ReactNode;
	className?: string;
}

/* ─────────────────────────── styles ─────────────────────────── */

const variantClasses: Record<BadgeVariant, { badge: string; dot: string }> = {
	default: {
		badge: "glass-overlay text-foreground/80",
		dot: "bg-foreground/40",
	},
	primary: {
		badge: "bg-primary/10 border border-primary/20 text-primary",
		dot: "bg-primary",
	},
	success: {
		badge: "bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400",
		dot: "bg-emerald-500",
	},
	warning: {
		badge: "bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400",
		dot: "bg-amber-500",
	},
	danger: {
		badge: "bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400",
		dot: "bg-rose-500",
	},
	info: {
		badge: "bg-sky-500/10 border border-sky-500/20 text-sky-600 dark:text-sky-400",
		dot: "bg-sky-500",
	},
	discord: {
		badge: "bg-discord-primary/10 border border-discord-primary/20 text-discord-primary",
		dot: "bg-discord-primary",
	},
};

const sizeClasses: Record<BadgeSize, string> = {
	sm: "px-2 py-0.5 text-xs gap-1.5",
	md: "px-2.5 py-1 text-sm gap-2",
};

/* ─────────────────────────── component ─────────────────────────── */

export function Badge({
	variant = "default",
	size = "md",
	dot = false,
	dismissible = false,
	onDismiss,
	children,
	className = "",
}: BadgeProps) {
	const v = variantClasses[variant];

	return (
		<span
			className={`inline-flex items-center rounded-full font-bold select-none transition-colors ${v.badge} ${sizeClasses[size]} ${className}`}
		>
			{dot && (
				<span
					aria-hidden
					className={`animate-pulse-soft h-1.5 w-1.5 rounded-full shrink-0 ${v.dot}`}
				/>
			)}
			{children}
			{dismissible && (
				<button
					type="button"
					onClick={onDismiss}
					aria-label="제거"
					className="ml-0.5 -mr-0.5 inline-flex items-center justify-center rounded-full p-0.5 hover:bg-foreground/10 transition-colors cursor-pointer"
				>
					<svg
						aria-hidden
						className="h-3 w-3"
						viewBox="0 0 12 12"
						fill="none"
						stroke="currentColor"
						strokeWidth={2}
						strokeLinecap="round"
					>
						<path d="M3 3l6 6M9 3l-6 6" />
					</svg>
				</button>
			)}
		</span>
	);
}
