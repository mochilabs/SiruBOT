"use client";

import type { ReactNode } from "react";

import { ConfirmDialog } from "@/components/primitives/confirm-dialog";

interface ConfirmDeleteModalProps {
	open: boolean;
	title: string;
	/** 확인 본문 — 대상 이름을 <strong>로 강조한 문장을 넘겨요 */
	children: ReactNode;
	onClose: () => void;
	onConfirm: () => void;
	loading: boolean;
}

/** 플레이리스트·트랙 삭제 확인 공용 모달 — ConfirmDialog의 삭제 프리셋 */
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
