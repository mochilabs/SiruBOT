/* ─────────────────────────── types ─────────────────────────── */

type DotStatus = "ready" | "idle" | "connecting" | "disconnected" | "errored";
type DotSize = "sm" | "md" | "lg";

interface StatusDotProps {
	status?: DotStatus;
	size?: DotSize;
	pulse?: boolean;
	label?: string;
	className?: string;
}

/* ─────────────────────────── styles ─────────────────────────── */

const statusColors: Record<DotStatus, string> = {
	ready: "bg-emerald-500",
	idle: "bg-amber-500",
	connecting: "bg-sky-500",
	disconnected: "bg-rose-500",
	errored: "bg-rose-500",
};

const sizeClasses: Record<DotSize, string> = {
	sm: "h-1.5 w-1.5",
	md: "h-2 w-2",
	lg: "h-3 w-3",
};

/* ─────────────────────────── component ─────────────────────────── */

export function StatusDot({
	status = "ready",
	size = "md",
	pulse = true,
	label,
	className = "",
}: StatusDotProps) {
	return (
		<span
			role="status"
			aria-label={label ?? status}
			className={`inline-flex items-center gap-2 ${className}`}
		>
			<span
				className={`rounded-full shrink-0 ${sizeClasses[size]} ${statusColors[status]} ${pulse ? "animate-pulse-soft" : ""}`}
			/>
			{label && (
				<span className="text-xs font-medium text-muted-foreground capitalize">
					{label}
				</span>
			)}
		</span>
	);
}
