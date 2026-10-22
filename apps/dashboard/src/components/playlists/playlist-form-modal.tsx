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

/** create는 안내 문구가 있는 빈 폼, edit은 현재 값이 채진 채 표시예요 */
type PlaylistFormMode = "create" | "edit";

const MODE_COPY: Record<PlaylistFormMode, { title: string; namePlaceholder?: string; descLabel: string; descPlaceholder?: string; submitLabel: string; idPrefix: string }> = {
	create: {
		title: "새 플레이리스트 생성",
		namePlaceholder: "이름 입력 (예: 코딩할 때 듣는 노동요)",
		descLabel: "설명 (선택사항)",
		descPlaceholder: "플레이리스트에 대한 간단한 설명을 입력하세요.",
		submitLabel: "생성하기",
		idPrefix: "p",
	},
	edit: {
		title: "플레이리스트 정보 수정",
		descLabel: "설명",
		submitLabel: "수정 완료",
		idPrefix: "pe",
	},
};

interface PlaylistFormModalProps {
	mode: PlaylistFormMode;
	open: boolean;
	onClose: () => void;
	nameInput: string;
	descInput: string;
	onNameChange: (v: string) => void;
	onDescChange: (v: string) => void;
	onSubmit: () => void;
	loading: boolean;
}

/** 플레이리스트 생성·수정 공용 폼 모달 — 제목/placeholder/제출 문구만 mode로 갈아 끼워요 */
export function PlaylistFormModal({
	mode,
	open,
	onClose,
	nameInput,
	descInput,
	onNameChange,
	onDescChange,
	onSubmit,
	loading,
}: PlaylistFormModalProps) {
	const copy = MODE_COPY[mode];
	const nameId = `${copy.idPrefix}-name`;
	const descId = `${copy.idPrefix}-desc`;
	return (
		<Dialog open={open} onOpenChange={(isOpen: boolean) => { if (!isOpen) onClose(); }}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{copy.title}</DialogTitle>
				</DialogHeader>
				<div className="space-y-4 py-2">
					<Field htmlFor={nameId} label="플레이리스트 이름">
						<Input
							id={nameId}
							type="text"
							placeholder={copy.namePlaceholder}
							value={nameInput}
							onChange={(e: React.ChangeEvent<HTMLInputElement>) => onNameChange(e.target.value)}
							maxLength={50}
						/>
					</Field>
					<Field htmlFor={descId} label={copy.descLabel}>
						<Textarea
							id={descId}
							placeholder={copy.descPlaceholder}
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
						{copy.submitLabel}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
