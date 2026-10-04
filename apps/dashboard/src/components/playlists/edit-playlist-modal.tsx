"use client";

import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/overlay/modal";
import { Button } from "@/components/primitives/button";
import { Field } from "@/components/primitives/field";
import { Input, Textarea } from "@/components/primitives/input";

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
					<Field htmlFor="pe-name" label="플레이리스트 이름">
						<Input
							id="pe-name"
							type="text"
							value={nameInput}
							onChange={(e) => onNameChange(e.target.value)}
							maxLength={50}
						/>
					</Field>
					<Field htmlFor="pe-desc" label="설명">
						<Textarea
							id="pe-desc"
							value={descInput}
							onChange={(e) => onDescChange(e.target.value)}
							maxLength={200}
							className="min-h-[80px] resize-none"
						/>
					</Field>
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
