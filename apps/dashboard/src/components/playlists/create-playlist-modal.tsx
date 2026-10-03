"use client";

import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/overlay/modal";
import { Button } from "@/components/primitives/button";
import { Field } from "@/components/primitives/field";
import { Input, Textarea } from "@/components/primitives/input";

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
					<Field htmlFor="p-name" label="플레이리스트 이름">
						<Input
							id="p-name"
							type="text"
							placeholder="이름 입력 (예: 코딩할 때 듣는 노동요)"
							value={nameInput}
							onChange={(e) => onNameChange(e.target.value)}
							maxLength={50}
						/>
					</Field>
					<Field htmlFor="p-desc" label="설명 (선택사항)">
						<Textarea
							id="p-desc"
							placeholder="플레이리스트에 대한 간단한 설명을 입력하세요."
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
					생성하기
				</Button>
			</ModalFooter>
		</Modal>
	);
}
