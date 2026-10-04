import { Inbox } from "lucide-react";

import { cn } from "@/lib/utils";

/* ─────────────────────────── types ─────────────────────────── */

interface EmptyStateProps {
	icon?: React.ComponentType<{ className?: string }>;
	title: string;
	description?: React.ReactNode;
	action?: React.ReactNode;
	secondaryAction?: React.ReactNode;
	/** p-20이 기본. 표/프로세스 목록 등 좁은 영역에서는 sm. */
	size?: "sm" | "md";
	className?: string;
}

/* ─────────────────────────── component ─────────────────────────── */

export function EmptyState({ icon: Icon = Inbox, title, description, action, secondaryAction, size = "md", className }: EmptyStateProps) {
	return (
		<div className={cn("flex flex-col items-center justify-center gap-3 border border-dashed border-border-strong bg-surface-2 text-center", size === "md" ? "p-12 sm:p-16" : "p-8", className)}>
			<span className="inline-flex h-11 w-11 items-center justify-center rounded-menu border border-border bg-surface-1 text-muted-foreground">
				<Icon className="h-5 w-5" aria-hidden />
			</span>
			<p className="text-sm font-semibold text-foreground">{title}</p>
			{description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
			{(action || secondaryAction) && (
				<div className="flex flex-wrap items-center justify-center gap-2 pt-1">
					{action}
					{secondaryAction}
				</div>
			)}
		</div>
	);
}
