"use client";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

interface DeleteTrackModalProps {
	open: boolean;
	trackTitle: string | null;
	onClose: () => void;
	onConfirm: () => void;
	loading: boolean;
}

export function DeleteTrackModal({ open, trackTitle, onClose, onConfirm, loading }: DeleteTrackModalProps) {
	return (
		<Dialog open={open} onOpenChange={(isOpen: boolean) => { if (!isOpen) onClose(); }}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>트랙 삭제</DialogTitle>
				</DialogHeader>
				<p className="text-sm text-muted-foreground font-medium leading-relaxed py-2">
					정말 <strong>{trackTitle}</strong> 곡을 삭제할까요?<br />
					이 플레이리스트에서만 제거되며 곡 자체는 남아있어요.
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
