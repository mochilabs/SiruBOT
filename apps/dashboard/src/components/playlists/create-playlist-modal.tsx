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
		<Dialog open={open} onOpenChange={(isOpen: boolean) => { if (!isOpen) onClose(); }}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>새 플레이리스트 생성</DialogTitle>
				</DialogHeader>
				<div className="space-y-4 py-2">
					<Field htmlFor="p-name" label="플레이리스트 이름">
						<Input
							id="p-name"
							type="text"
							placeholder="이름 입력 (예: 코딩할 때 듣는 노동요)"
							value={nameInput}
							onChange={(e: React.ChangeEvent<HTMLInputElement>) => onNameChange(e.target.value)}
							maxLength={50}
						/>
					</Field>
					<Field htmlFor="p-desc" label="설명 (선택사항)">
						<Textarea
							id="p-desc"
							placeholder="플레이리스트에 대한 간단한 설명을 입력하세요."
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
						생성하기
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
