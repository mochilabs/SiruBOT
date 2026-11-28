"use client";
import { Inbox } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
	icon?: React.ComponentType<{ className?: string }>;
	tone?: "default" | "warning" | "destructive";
	title: string;
	titleAs?: "p" | "h2" | "h3";
	description?: React.ReactNode;
	action?: React.ReactNode;
	secondaryAction?: React.ReactNode;
	size?: "sm" | "md";
	className?: string;
}

function EmptyStateAction({ action }: { action: React.ReactNode }) {
	if (!action) return null;
	if (typeof action === "string") {
		return <Button>{action}</Button>;
	}
	return <>{action}</>;
}

const toneChipClass = {
	default: "bg-surface-1 text-muted-foreground",
	warning: "bg-warning/10 text-warning",
	destructive: "bg-destructive/10 text-destructive",
} as const;

export function EmptyState({ icon: Icon = Inbox, tone = "default", title, titleAs: TitleTag = "p", description, action, secondaryAction, size = "md", className }: EmptyStateProps) {
	return (
		<div className={cn("flex flex-col items-center justify-center gap-3 rounded-card bg-surface-2 text-center", size === "md" ? "p-12 sm:p-16" : "p-8", className)}>
			<span className={cn("inline-flex h-11 w-11 items-center justify-center rounded-control", toneChipClass[tone])}>
				<Icon className="h-5 w-5" aria-hidden />
			</span>
			<TitleTag className="text-sm font-semibold text-foreground">{title}</TitleTag>
			{description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
			{(action || secondaryAction) && (
				<div className="flex flex-wrap items-center justify-center gap-2 pt-1">
					{action && <EmptyStateAction action={action} />}
					{secondaryAction && <EmptyStateAction action={secondaryAction} />}
				</div>
			)}
		</div>
	);
}
