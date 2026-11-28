"use client";

import type { ReactNode } from "react";

import { ConfirmDialog } from "@/components/primitives/confirm-dialog";

interface ConfirmDeleteModalProps {
	open: boolean;
	title: string;
	children: ReactNode;
	onClose: () => void;
	onConfirm: () => void;
	loading: boolean;
}

export function ConfirmDeleteModal({ open, title, children, onClose, onConfirm, loading }: ConfirmDeleteModalProps) {
	return (
		<ConfirmDialog
			open={open}
			title={title}
			onClose={onClose}
			onConfirm={onConfirm}
			loading={loading}
			confirmLabel="삭제하기"
			variant="danger"
		>
			{children}
		</ConfirmDialog>
	);
}
