"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { Portal } from "../overlay/portal";

/* ─────────────────────────── types ─────────────────────────── */

type ToastVariant = "success" | "error" | "info" | "warning";

interface ToastItem {
	id: string;
	variant: ToastVariant;
	message: string;
	description?: string;
	duration?: number;
}

interface ToastContextValue {
	toasts: ToastItem[];
	add: (toast: Omit<ToastItem, "id">) => string;
	remove: (id: string) => void;
	success: (message: string, description?: string) => string;
	error: (message: string, description?: string) => string;
	info: (message: string, description?: string) => string;
	warning: (message: string, description?: string) => string;
}

/* ─────────────────────────── styles ─────────────────────────── */

const variantConfig: Record<
	ToastVariant,
	{ icon: React.ComponentType<{ className?: string }>; border: string; iconColor: string; bg: string }
> = {
	success: {
		icon: CheckCircle2,
		border: "border-emerald-500/30",
		iconColor: "text-emerald-500",
		bg: "bg-emerald-500/5",
	},
	error: {
		icon: XCircle,
		border: "border-rose-500/30",
		iconColor: "text-rose-500",
		bg: "bg-rose-500/5",
	},
	info: {
		icon: Info,
		border: "border-sky-500/30",
		iconColor: "text-sky-500",
		bg: "bg-sky-500/5",
	},
	warning: {
		icon: AlertTriangle,
		border: "border-amber-500/30",
		iconColor: "text-amber-500",
		bg: "bg-amber-500/5",
	},
};

/* ─────────────────────────── context ─────────────────────────── */

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
	const ctx = useContext(ToastContext);
	if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
	return ctx;
}

/* ─────────────────────────── single toast ─────────────────────────── */

function Toast({
	toast,
	onRemove,
}: {
	toast: ToastItem;
	onRemove: (id: string) => void;
}) {
	const config = variantConfig[toast.variant];
	const Icon = config.icon;

	return (
		<m.div
			layout
			initial={{ opacity: 0, y: 24, scale: 0.95 }}
			animate={{ opacity: 1, y: 0, scale: 1 }}
			exit={{ opacity: 0, y: 24, scale: 0.95 }}
			transition={{ type: "spring", stiffness: 400, damping: 30 }}
			role="alert"
			aria-live="polite"
			className={`pointer-events-auto glass-panel ${config.bg} ${config.border} px-4 py-3 flex items-start gap-3 min-w-[320px] max-w-[420px] shadow-2xl`}
		>
			<Icon className={`h-5 w-5 shrink-0 mt-0.5 ${config.iconColor}`} />

			<div className="flex-1 min-w-0">
				<p className="text-sm font-bold text-foreground leading-snug">
					{toast.message}
				</p>
				{toast.description && (
					<p className="mt-1 text-xs font-medium text-muted-foreground leading-relaxed">
						{toast.description}
					</p>
				)}
			</div>

			<button
				type="button"
				onClick={() => onRemove(toast.id)}
				className="shrink-0 p-1 rounded-lg hover:bg-foreground/10 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
				aria-label="닫기"
			>
				<X className="h-3.5 w-3.5" />
			</button>
		</m.div>
	);
}

/* ─────────────────────────── provider ─────────────────────────── */

let _counter = 0;
function uid() {
	return `toast-${++_counter}-${Date.now()}`;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
	const [toasts, setToasts] = useState<ToastItem[]>([]);

	const remove = useCallback((id: string) => {
		setToasts((prev) => prev.filter((t) => t.id !== id));
	}, []);

	const add = useCallback(
		(toast: Omit<ToastItem, "id">) => {
			const id = uid();
			const duration = toast.duration ?? 5000;
			setToasts((prev) => [...prev, { ...toast, id }]);

			if (duration > 0) {
				setTimeout(() => remove(id), duration);
			}
			return id;
		},
		[remove],
	);

	const success = useCallback(
		(message: string, description?: string) =>
			add({ variant: "success", message, description }),
		[add],
	);

	const error = useCallback(
		(message: string, description?: string) =>
			add({ variant: "error", message, description }),
		[add],
	);

	const info = useCallback(
		(message: string, description?: string) =>
			add({ variant: "info", message, description }),
		[add],
	);

	const warning = useCallback(
		(message: string, description?: string) =>
			add({ variant: "warning", message, description }),
		[add],
	);

	const value: ToastContextValue = { toasts, add, remove, success, error, info, warning };

	return (
		<ToastContext.Provider value={value}>
			{children}

			{/* Toast container — fixed bottom center */}
			<Portal>
				<div
					aria-label="알림"
					className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex flex-col-reverse items-center gap-2 pointer-events-none"
				>
					<AnimatePresence mode="popLayout">
						{toasts.map((toast) => (
							<Toast key={toast.id} toast={toast} onRemove={remove} />
						))}
					</AnimatePresence>
				</div>
			</Portal>
		</ToastContext.Provider>
	);
}
