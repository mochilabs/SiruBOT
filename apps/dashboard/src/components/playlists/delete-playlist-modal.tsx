"use client";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

interface DeletePlaylistModalProps {
	open: boolean;
	playlistName: string | null;
	onClose: () => void;
	onConfirm: () => void;
	loading: boolean;
}

export function DeletePlaylistModal({
	open,
	playlistName,
	onClose,
	onConfirm,
	loading,
}: DeletePlaylistModalProps) {
	return (
		<Dialog open={open} onOpenChange={(isOpen: boolean) => { if (!isOpen) onClose(); }}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>플레이리스트 삭제</DialogTitle>
				</DialogHeader>
				<p className="text-sm text-muted-foreground font-medium leading-relaxed py-2">
					정말 <strong>{playlistName}</strong> 플레이리스트를 삭제하시겠어요?<br />
					이 작업은 되돌릴 수 없으며 소속된 트랙 정보도 모두 함께 지워집니다.
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
