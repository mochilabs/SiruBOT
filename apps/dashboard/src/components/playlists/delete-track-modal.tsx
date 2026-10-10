"use client";

import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/overlay/modal";
import { Button } from "@/components/primitives/button";

interface DeleteTrackModalProps {
	open: boolean;
	trackTitle: string | null;
	onClose: () => void;
	onConfirm: () => void;
	loading: boolean;
}

/* delete-playlist-modal과 같은 확인 모달 패턴 — 트랙 단위 삭제용 */
export function DeleteTrackModal({ open, trackTitle, onClose, onConfirm, loading }: DeleteTrackModalProps) {
	return (
		<Modal open={open} onClose={onClose}>
			<ModalHeader onClose={onClose}>트랙 삭제</ModalHeader>
			<ModalBody>
				<p className="text-sm text-muted-foreground font-medium leading-relaxed py-2">
					정말 <strong>{trackTitle}</strong> 곡을 삭제할까요?<br />
					이 플레이리스트에서만 제거되며 곡 자체는 남아있어요.
				</p>
			</ModalBody>
			<ModalFooter>
				<Button variant="secondary" size="sm" onClick={onClose}>
					취소
				</Button>
				<Button variant="danger" size="sm" loading={loading} onClick={onConfirm}>
					삭제하기
				</Button>
			</ModalFooter>
		</Modal>
	);
}