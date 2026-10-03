import { type Tone,toneStyles } from "@/components/primitives/badge";
import { cn } from "@/lib/utils";

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

/** StatusBadge와 동일한 톤 매핑 (badge.tsx의 toneStyles 사용) */
const statusTone: Record<DotStatus, Tone> = {
	ready: "success",
	idle: "warning",
	connecting: "info",
	disconnected: "destructive",
	errored: "destructive",
};

const sizeClasses: Record<DotSize, string> = {
	sm: "h-1.5 w-1.5",
	md: "h-2 w-2",
	lg: "h-3 w-3",
};

/* ─────────────────────────── component ─────────────────────────── */

export function StatusDot({ status = "ready", size = "md", pulse = true, label, className }: StatusDotProps) {
	return (
		<span role="status" aria-label={label ?? status} className={cn("inline-flex items-center gap-2", className)}>
			<span aria-hidden className={cn("shrink-0 rounded-full", sizeClasses[size], toneStyles[statusTone[status]].dot, pulse && "animate-pulse-soft")} />
			{label && <span className="text-xs font-medium text-muted-foreground">{label}</span>}
		</span>
	);
}
