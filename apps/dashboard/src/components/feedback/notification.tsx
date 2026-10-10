"use client";

import { AnimatePresence, m } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

import { Button } from "@/components/primitives/button";

import { Portal } from "../overlay/portal";

/* ─────────────────────────── types ─────────────────────────── */

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

/* ─────────────────────────── styles ─────────────────────────── */

const variantConfig: Record<
	NotificationVariant,
	{ icon: React.ComponentType<{ className?: string }>; accentBorder: string; iconColor: string }
> = {
	success: { icon: CheckCircle2, accentBorder: "border-l-success", iconColor: "text-success" },
	error: { icon: XCircle, accentBorder: "border-l-destructive", iconColor: "text-destructive" },
	info: { icon: Info, accentBorder: "border-l-info", iconColor: "text-info" },
	warning: { icon: AlertTriangle, accentBorder: "border-l-warning", iconColor: "text-warning" },
};

/* ─────────────────────────── single notification ─────────────────────────── */

function Notification({ notification, onDismiss }: NotificationProps) {
	const config = variantConfig[notification.variant];
	const Icon = config.icon;

	return (
		<m.div
			layout
			initial={{ opacity: 0, x: 60, scale: 0.95 }}
			animate={{ opacity: 1, x: 0, scale: 1 }}
			exit={{ opacity: 0, x: 60, scale: 0.95 }}
			transition={{ type: "spring", stiffness: 400, damping: 30 }}
			role="alert"
			aria-live="polite"
			className={`pointer-events-auto rounded-card border-l-4 bg-popover ${config.accentBorder} p-4 w-[380px] max-w-[min(380px,calc(100vw-2rem))] shadow-2xl`}
		>
			<div className="flex items-start gap-3">
				<Icon className={`h-5 w-5 shrink-0 mt-0.5 ${config.iconColor}`} />

				<div className="flex-1 min-w-0 space-y-1">
					<p className="text-sm font-black tracking-tight text-foreground leading-snug">
						{notification.title}
					</p>
					{notification.description && (
						<p className="text-xs font-medium text-muted-foreground leading-relaxed">
							{notification.description}
						</p>
					)}
					{notification.action && (
						<Button
							variant="ghost"
							size="sm"
							onClick={notification.action.onClick}
							className="mt-2 h-auto px-0 text-xs font-bold text-primary-text hover:bg-transparent hover:text-primary/80"
						>
							{notification.action.label}
						</Button>
					)}
				</div>

				<Button
					variant="icon"
					size="sm"
					onClick={() => onDismiss(notification.id)}
					className="h-6 w-6 shrink-0 rounded-lg border-transparent bg-transparent p-1 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
					aria-label="닫기"
				>
					<X className="h-3.5 w-3.5" />
				</Button>
			</div>
		</m.div>
	);
}

/* ─────────────────────────── stack container ─────────────────────────── */

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
