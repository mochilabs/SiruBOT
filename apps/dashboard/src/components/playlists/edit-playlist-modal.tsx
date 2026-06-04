"use client";

import { Modal, ModalBody, ModalFooter,ModalHeader } from "@/components/overlay/modal";
import { Button } from "@/components/primitives/button";

interface EditPlaylistModalProps {
	open: boolean;
	onClose: () => void;
	nameInput: string;
	descInput: string;
	onNameChange: (v: string) => void;
	onDescChange: (v: string) => void;
	onSubmit: () => void;
	loading: boolean;
}

export function EditPlaylistModal({
	open,
	onClose,
	nameInput,
	descInput,
	onNameChange,
	onDescChange,
	onSubmit,
	loading,
}: EditPlaylistModalProps) {
	return (
		<Modal open={open} onClose={onClose}>
			<ModalHeader onClose={onClose}>플레이리스트 정보 수정</ModalHeader>
			<ModalBody>
				<div className="space-y-4 py-2">
					<div className="space-y-1.5">
						<label htmlFor="pe-name" className="text-xs font-medium uppercase tracking-wider text-muted-foreground/60">플레이리스트 이름</label>
						<input
							id="pe-name"
							type="text"
							value={nameInput}
							onChange={(e) => onNameChange(e.target.value)}
							className="w-full px-4 py-2.5 rounded-xl border border-border/80 bg-muted/20 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-foreground"
							maxLength={50}
						/>
					</div>
					<div className="space-y-1.5">
						<label htmlFor="pe-desc" className="text-xs font-medium uppercase tracking-wider text-muted-foreground/60">설명</label>
						<textarea
							id="pe-desc"
							value={descInput}
							onChange={(e) => onDescChange(e.target.value)}
							className="w-full px-4 py-2.5 rounded-xl border border-border/80 bg-muted/20 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all min-h-[80px] text-foreground resize-none"
							maxLength={200}
						/>
					</div>
				</div>
			</ModalBody>
			<ModalFooter>
				<Button variant="secondary" size="sm" onClick={onClose}>
					취소
				</Button>
				<Button variant="primary" size="sm" loading={loading} onClick={onSubmit}>
					수정 완료
				</Button>
			</ModalFooter>
		</Modal>
	);
}
