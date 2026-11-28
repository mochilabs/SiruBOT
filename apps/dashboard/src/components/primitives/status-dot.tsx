import { badgeToneClasses } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const toneStyles = {
	neutral: { badge: badgeToneClasses.default, dot: "bg-dot-neutral", text: "text-foreground/80" },
	primary: { badge: badgeToneClasses.primary, dot: "bg-primary-control", text: "text-primary-text" },
	success: { badge: badgeToneClasses.success, dot: "bg-success", text: "text-success" },
	warning: { badge: badgeToneClasses.warning, dot: "bg-warning", text: "text-warning" },
	destructive: { badge: badgeToneClasses.destructive, dot: "bg-destructive", text: "text-destructive" },
	info: { badge: badgeToneClasses.info, dot: "bg-info", text: "text-info" },
	discord: { badge: badgeToneClasses.discord, dot: "bg-discord-primary", text: "text-discord-primary" },
} as const;

export type Tone = keyof typeof toneStyles;

type DotStatus = "ready" | "idle" | "connecting" | "disconnected" | "errored";
type DotSize = "sm" | "md" | "lg";

interface StatusDotProps {
	status?: DotStatus;
	size?: DotSize;
	pulse?: boolean;
	label?: string;
	className?: string;
}

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

export function StatusDot({ status = "ready", size = "md", pulse, label, className }: StatusDotProps) {
	const isPulsing = pulse ?? (status === "connecting" || status === "errored");
	return (
		<span role="status" aria-label={label ?? status} className={cn("inline-flex items-center gap-2", className)}>
			<span
				aria-hidden
				className={cn("shrink-0 rounded-full", sizeClasses[size], toneStyles[statusTone[status]].dot, isPulsing && "animate-pulse-soft")}
			/>
			{label && <span className="text-xs font-medium text-muted-foreground">{label}</span>}
		</span>
	);
}
