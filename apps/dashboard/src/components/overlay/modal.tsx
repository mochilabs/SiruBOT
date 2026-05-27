"use client";

import { useCallback, useEffect, useRef } from "react";
import { AnimatePresence, m } from "framer-motion";
import { X } from "lucide-react";
import { Portal } from "./portal";

/* ─────────────────────────── types ─────────────────────────── */

interface ModalProps {
	open: boolean;
	onClose: () => void;
	children: React.ReactNode;
	className?: string;
}

interface ModalHeaderProps {
	children: React.ReactNode;
	onClose?: () => void;
	className?: string;
}

interface ModalSectionProps {
	children: React.ReactNode;
	className?: string;
}

/* ─────────────────────────── focus trap ─────────────────────────── */

function useFocusTrap(open: boolean) {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open || !ref.current) return;

		const el = ref.current;
		const prev = document.activeElement as HTMLElement | null;
		const focusables = el.querySelectorAll<HTMLElement>(
			'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
		);
		focusables[0]?.focus();

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key !== "Tab" || focusables.length === 0) return;
			const first = focusables[0];
			const last = focusables[focusables.length - 1];

			if (e.shiftKey) {
				if (document.activeElement === first) {
					e.preventDefault();
					last.focus();
				}
			} else {
				if (document.activeElement === last) {
					e.preventDefault();
					first.focus();
				}
			}
		};

		el.addEventListener("keydown", handleKeyDown);
		return () => {
			el.removeEventListener("keydown", handleKeyDown);
			prev?.focus();
		};
	}, [open]);

	return ref;
}

/* ─────────────────────────── sub-components ─────────────────────────── */

export function ModalHeader({ children, onClose, className = "" }: ModalHeaderProps) {
	return (
		<div className={`flex items-center justify-between px-6 py-4 border-b border-border/40 ${className}`}>
			<h2 className="text-xl font-black tracking-tighter text-foreground">{children}</h2>
			{onClose && (
				<button
					type="button"
					onClick={onClose}
					className="p-2 rounded-xl hover:bg-foreground/10 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
					aria-label="닫기"
				>
					<X className="h-5 w-5" />
				</button>
			)}
		</div>
	);
}

export function ModalBody({ children, className = "" }: ModalSectionProps) {
	return <div className={`px-6 py-5 ${className}`}>{children}</div>;
}

export function ModalFooter({ children, className = "" }: ModalSectionProps) {
	return (
		<div className={`flex items-center justify-end gap-3 px-6 py-4 border-t border-border/40 ${className}`}>
			{children}
		</div>
	);
}

/* ─────────────────────────── main component ─────────────────────────── */

export function Modal({ open, onClose, children, className = "" }: ModalProps) {
	const trapRef = useFocusTrap(open);

	const handleEsc = useCallback(
		(e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		},
		[onClose],
	);

	useEffect(() => {
		if (!open) return;
		document.addEventListener("keydown", handleEsc);
		document.body.style.overflow = "hidden";
		return () => {
			document.removeEventListener("keydown", handleEsc);
			document.body.style.overflow = "";
		};
	}, [open, handleEsc]);

	return (
		<Portal>
			<AnimatePresence>
				{open && (
					<div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
						{/* Backdrop */}
						<m.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.2 }}
							className="absolute inset-0 bg-black/60 backdrop-blur-sm"
							onClick={onClose}
							aria-hidden
						/>

						{/* Content */}
						<m.div
							ref={trapRef}
							role="dialog"
							aria-modal="true"
							initial={{ opacity: 0, scale: 0.95, y: 8 }}
							animate={{ opacity: 1, scale: 1, y: 0 }}
							exit={{ opacity: 0, scale: 0.95, y: 8 }}
							transition={{ type: "spring", stiffness: 400, damping: 30 }}
							className={`relative z-10 glass-panel w-full max-w-lg overflow-hidden shadow-2xl ${className}`}
						>
							{children}
						</m.div>
					</div>
				)}
			</AnimatePresence>
		</Portal>
	);
}

/* ─────────────────────────── compound export ─────────────────────────── */

Modal.Header = ModalHeader;
Modal.Body = ModalBody;
Modal.Footer = ModalFooter;
