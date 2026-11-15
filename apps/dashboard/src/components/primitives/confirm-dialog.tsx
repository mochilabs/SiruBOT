"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

export interface ConfirmDialogProps {
	open: boolean;
	title: string;
	children: ReactNode;
	onClose: () => void;
	onConfirm: () => void;
	loading?: boolean;
	confirmLabel?: string;
	cancelLabel?: string;
	variant?: "danger" | "primary" | "default";
}

/** 파괴적 작업·중요 변경 확인용 공용 모달 — 진행 중에는 닫히지 않도록 잠가요 */
export function ConfirmDialog({
	open,
	title,
	children,
	onClose,
	onConfirm,
	loading = false,
	confirmLabel = "확인",
	cancelLabel = "취소",
	variant = "danger",
}: ConfirmDialogProps) {
	return (
		<Dialog
			open={open}
			onOpenChange={(isOpen: boolean) => {
				if (!isOpen && !loading) onClose();
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
				</DialogHeader>
				<div className="py-2 text-sm font-medium leading-relaxed text-muted-foreground">
					{children}
				</div>
				<DialogFooter>
					<Button variant="secondary" size="sm" disabled={loading} onClick={onClose}>
						{cancelLabel}
					</Button>
					<Button variant={variant} size="sm" loading={loading} onClick={onConfirm}>
						{confirmLabel}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
