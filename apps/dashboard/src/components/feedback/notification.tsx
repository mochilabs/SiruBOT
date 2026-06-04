"use client";

import { AnimatePresence, m } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

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
	success: { icon: CheckCircle2, accentBorder: "border-l-emerald-500", iconColor: "text-emerald-500" },
	error: { icon: XCircle, accentBorder: "border-l-rose-500", iconColor: "text-rose-500" },
	info: { icon: Info, accentBorder: "border-l-sky-500", iconColor: "text-sky-500" },
	warning: { icon: AlertTriangle, accentBorder: "border-l-amber-500", iconColor: "text-amber-500" },
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
			className={`pointer-events-auto glass-panel border-l-4 ${config.accentBorder} p-4 w-[380px] shadow-2xl`}
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
						<button
							type="button"
							onClick={notification.action.onClick}
							className="mt-2 text-xs font-bold text-primary hover:text-primary/80 transition-colors cursor-pointer"
						>
							{notification.action.label}
						</button>
					)}
				</div>

				<button
					type="button"
					onClick={() => onDismiss(notification.id)}
					className="shrink-0 p-1 rounded-lg hover:bg-foreground/10 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
					aria-label="닫기"
				>
					<X className="h-3.5 w-3.5" />
				</button>
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
