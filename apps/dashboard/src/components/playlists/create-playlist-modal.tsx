"use client";

import { Modal, ModalBody, ModalFooter,ModalHeader } from "@/components/overlay/modal";
import { Button } from "@/components/primitives/button";

interface CreatePlaylistModalProps {
	open: boolean;
	onClose: () => void;
	nameInput: string;
	descInput: string;
	onNameChange: (v: string) => void;
	onDescChange: (v: string) => void;
	onSubmit: () => void;
	loading: boolean;
}

export function CreatePlaylistModal({
	open,
	onClose,
	nameInput,
	descInput,
	onNameChange,
	onDescChange,
	onSubmit,
	loading,
}: CreatePlaylistModalProps) {
	return (
		<Modal open={open} onClose={onClose}>
			<ModalHeader onClose={onClose}>새 플레이리스트 생성</ModalHeader>
			<ModalBody>
				<div className="space-y-4 py-2">
					<div className="space-y-1.5">
						<label htmlFor="p-name" className="text-xs font-medium uppercase tracking-wider text-muted-foreground/60">플레이리스트 이름</label>
						<input
							id="p-name"
							type="text"
							placeholder="이름 입력 (예: 코딩할 때 듣는 노동요)"
							value={nameInput}
							onChange={(e) => onNameChange(e.target.value)}
							className="w-full px-4 py-2.5 rounded-xl border border-border/80 bg-muted/20 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-foreground"
							maxLength={50}
						/>
					</div>
					<div className="space-y-1.5">
						<label htmlFor="p-desc" className="text-xs font-medium uppercase tracking-wider text-muted-foreground/60">설명 (선택사항)</label>
						<textarea
							id="p-desc"
							placeholder="플레이리스트에 대한 간단한 설명을 입력하세요."
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
					생성하기
				</Button>
			</ModalFooter>
		</Modal>
	);
}
