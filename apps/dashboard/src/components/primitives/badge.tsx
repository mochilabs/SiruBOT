"use client";

import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/* ─────────────────────────── styles ─────────────────────────── */

/** 디자인 토큰 기반 톤 — Badge·StatusDot·StatusBadge 공용 */
export const toneStyles = {
	neutral: { badge: "border border-border bg-surface-2 text-foreground/80", dot: "bg-muted-foreground", text: "text-foreground/80" },
	primary: { badge: "border border-primary/20 bg-primary/10 text-primary-text", dot: "bg-primary", text: "text-primary-text" },
	success: { badge: "border border-success/25 bg-success/10 text-success", dot: "bg-success", text: "text-success" },
	warning: { badge: "border border-warning/25 bg-warning/10 text-warning", dot: "bg-warning", text: "text-warning" },
	destructive: { badge: "border border-destructive/25 bg-destructive/10 text-destructive", dot: "bg-destructive", text: "text-destructive" },
	info: { badge: "border border-info/25 bg-info/10 text-info", dot: "bg-info", text: "text-info" },
	discord: { badge: "border border-discord-primary/20 bg-discord-primary/10 text-discord-primary", dot: "bg-discord-primary", text: "text-discord-primary" },
} as const;

export type Tone = keyof typeof toneStyles;

const badgeVariants = cva("inline-flex select-none items-center gap-1.5 rounded-full font-semibold transition-colors", {
	variants: {
		variant: {
			default: toneStyles.neutral.badge,
			primary: toneStyles.primary.badge,
			success: toneStyles.success.badge,
			warning: toneStyles.warning.badge,
			danger: toneStyles.destructive.badge,
			destructive: toneStyles.destructive.badge,
			info: toneStyles.info.badge,
			discord: toneStyles.discord.badge,
		},
		size: {
			sm: "px-2 py-0.5 text-xs",
			md: "px-2.5 py-1 text-sm",
		},
	},
	defaultVariants: { variant: "default", size: "md" },
});

/* ─────────────────────────── types ─────────────────────────── */

type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];

interface BadgeProps extends VariantProps<typeof badgeVariants> {
	dot?: boolean;
	dismissible?: boolean;
	onDismiss?: () => void;
	children: React.ReactNode;
	className?: string;
}

/* ─────────────────────────── Badge ─────────────────────────── */

export function Badge({ variant = "default", size = "md", dot = false, dismissible = false, onDismiss, children, className }: BadgeProps) {
	return (
		<span className={cn(badgeVariants({ variant, size }), className)}>
			{dot && (
				<span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotTone(variant))} />
			)}
			{children}
			{dismissible && (
				<button
					type="button"
					onClick={onDismiss}
					aria-label="제거"
					className="ml-0.5 -mr-0.5 inline-flex cursor-pointer items-center justify-center rounded-full p-0.5 transition-colors hover:bg-foreground/10"
				>
					<svg aria-hidden className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
						<path d="M3 3l6 6M9 3l-6 6" />
					</svg>
				</button>
			)}
		</span>
	);
}

function dotTone(variant: BadgeVariant): string {
	switch (variant) {
		case "primary":
			return toneStyles.primary.dot;
		case "success":
			return toneStyles.success.dot;
		case "warning":
			return toneStyles.warning.dot;
		case "danger":
		case "destructive":
			return toneStyles.destructive.dot;
		case "info":
			return toneStyles.info.dot;
		case "discord":
			return toneStyles.discord.dot;
		default:
			return toneStyles.neutral.dot;
	}
}

/* ─────────────────────────── StatusBadge ─────────────────────────── */

const statusTone: Record<string, Tone> = {
	READY: "success",
	IDLE: "warning",
	CONNECTING: "info",
	DISCONNECTED: "destructive",
	ERRORED: "destructive",
};

/** 프로세스/샤드 상태 배지. 임의의 status 문자열을 허용하되 미등록 값은 destructive. */
export function StatusBadge({ status }: { status: string }) {
	const normalized = status.toUpperCase();
	const tone: Tone = statusTone[normalized] ?? "destructive";
	/* R-19: READY·IDLE·DISCONNECTED는 안정 상태라 정적. CONNECTING·ERRORED 같은 과도 상태만 깜빡여요. */
	const isPulsing = normalized === "CONNECTING" || normalized === "ERRORED";

	return (
		<span className={cn("inline-flex items-center gap-2 rounded-control px-2.5 py-1 text-xs font-semibold", toneStyles[tone].badge)}>
			<span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", isPulsing && "animate-pulse-soft", toneStyles[tone].dot)} />
			{normalized}
		</span>
	);
}

export { badgeVariants };
