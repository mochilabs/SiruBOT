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

interface ConfirmDeleteModalProps {
	open: boolean;
	title: string;
	/** 확인 본문 — 대상 이름을 <strong>로 강조한 문장을 넘겨요 */
	children: ReactNode;
	onClose: () => void;
	onConfirm: () => void;
	loading: boolean;
}

/** 플레이리스트·트랙 삭제 확인 공용 모달 — 제목·본문 문구만 넘기면 돼요 */
export function ConfirmDeleteModal({ open, title, children, onClose, onConfirm, loading }: ConfirmDeleteModalProps) {
	return (
		<Dialog open={open} onOpenChange={(isOpen: boolean) => { if (!isOpen) onClose(); }}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
				</DialogHeader>
				<p className="text-sm text-muted-foreground font-medium leading-relaxed py-2">
					{children}
				</p>
				<DialogFooter>
					<Button variant="secondary" size="sm" onClick={onClose}>
						취소
					</Button>
					<Button variant="danger" size="sm" loading={loading} onClick={onConfirm}>
						삭제하기
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
