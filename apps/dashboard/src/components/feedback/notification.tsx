"use client";

import { AnimatePresence, m } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { Portal } from "../overlay/portal";

type NotificationVariant = "success" | "error" | "info" | "warning";

export interface NotificationItem {
	id: string;
	variant: NotificationVariant;
	title: string;
	description?: string;
	action?: { label: string; onClick: () => void };
}

interface NotificationProps {
	notification: NotificationItem;
	onDismiss: (id: string) => void;
}

interface NotificationStackProps {
	items: NotificationItem[];
	onDismiss: (id: string) => void;
}

const variantConfig: Record<
	NotificationVariant,
	{ icon: React.ComponentType<{ className?: string }>; dot: string }
> = {
	success: { icon: CheckCircle2, dot: "bg-success" },
	error: { icon: XCircle, dot: "bg-destructive" },
	info: { icon: Info, dot: "bg-info" },
	warning: { icon: AlertTriangle, dot: "bg-warning" },
};

function Notification({ notification, onDismiss }: NotificationProps) {
	const { icon: Icon, dot } = variantConfig[notification.variant];

	return (
		<m.div
			layout
			initial={{ opacity: 0, x: 60, scale: 0.95 }}
			animate={{ opacity: 1, x: 0, scale: 1 }}
			exit={{ opacity: 0, x: 60, scale: 0.95 }}
			transition={{ type: "spring", stiffness: 400, damping: 30 }}
			role="alert"
			aria-live="polite"
			className="pointer-events-auto w-[380px] max-w-[min(380px,calc(100vw-2rem))]"
		>
			<Card className="rounded-card border-0 bg-surface-3 p-0 shadow-2xl ring-0">
				<div className="flex items-start gap-3 p-4">
					<span className={cn("mt-2 h-2 w-2 shrink-0 rounded-full", dot)} aria-hidden="true" />
					<Icon className="mt-0.5 h-5 w-5 shrink-0 text-foreground" aria-hidden="true" />

					<div className="flex-1 min-w-0 space-y-1">
						<p className="text-sm font-bold text-foreground leading-snug">{notification.title}</p>
						{notification.description && (
							<p className="text-xs font-medium text-muted-foreground leading-relaxed">
								{notification.description}
							</p>
						)}
						{notification.action && (
							<Button
								variant="link"
								size="sm"
								onClick={notification.action.onClick}
								className="mt-2 h-auto px-0 text-xs font-semibold text-primary-control"
							>
								{notification.action.label}
							</Button>
						)}
					</div>

					<Button
						variant="ghost"
						size="icon-sm"
						onClick={() => onDismiss(notification.id)}
						aria-label="닫기"
						className="shrink-0 text-muted-foreground hover:text-foreground"
					>
						<X className="h-4 w-4" />
					</Button>
				</div>
			</Card>
		</m.div>
	);
}

export function NotificationStack({ items, onDismiss }: NotificationStackProps) {
	return (
		<Portal>
			<div
				aria-label="알림"
				className="fixed top-24 right-6 z-[200] flex flex-col gap-2 pointer-events-none"
			>
				<AnimatePresence mode="popLayout">
					{items.map((item) => (
						<Notification key={item.id} notification={item} onDismiss={onDismiss} />
					))}
				</AnimatePresence>
			</div>
		</Portal>
	);
}
