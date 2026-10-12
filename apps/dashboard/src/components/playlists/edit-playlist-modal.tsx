"use client";

import { Field } from "@/components/primitives/field";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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
		<Dialog open={open} onOpenChange={(isOpen: boolean) => { if (!isOpen) onClose(); }}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>플레이리스트 정보 수정</DialogTitle>
				</DialogHeader>
				<div className="space-y-4 py-2">
					<Field htmlFor="pe-name" label="플레이리스트 이름">
						<Input
							id="pe-name"
							type="text"
							value={nameInput}
							onChange={(e: React.ChangeEvent<HTMLInputElement>) => onNameChange(e.target.value)}
							maxLength={50}
						/>
					</Field>
					<Field htmlFor="pe-desc" label="설명">
						<Textarea
							id="pe-desc"
							value={descInput}
							onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onDescChange(e.target.value)}
							maxLength={200}
							className="min-h-[80px] resize-none"
						/>
					</Field>
				</div>
				<DialogFooter>
					<Button variant="secondary" size="sm" onClick={onClose}>
						취소
					</Button>
					<Button variant="primary" size="sm" loading={loading} onClick={onSubmit}>
						수정 완료
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
