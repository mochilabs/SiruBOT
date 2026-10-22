import { useRef, useState } from "react";

import { useToast } from "@/components/ui/toast";
import { toError } from "@/lib/api-error";

import { uploadAssetFile } from "../asset-picker";

/** 업로드 대상 — 어느 아이템의 어느 필드(섹션 썸네일/갤러리)에 주소를 채울지 기억해요 */
type UploadTarget = { index: number; kind: "section" | "media" };

export interface DesignUpload {
	uploading: boolean;
	singleFileInputRef: React.RefObject<HTMLInputElement | null>;
	multiFileInputRef: React.RefObject<HTMLInputElement | null>;
	/** 버튼 클릭 — 숨김 파일 입력을 열고 업로드 대상을 기억해요 (섹션은 단일, 갤러리는 다중) */
	requestUpload: (target: UploadTarget) => void;
	/** 숨김 파일 입력으로 받은 파일을 순차 업로드해 주소를 채워요 */
	handleUpload: (files: FileList | null) => Promise<void>;
}

/** 디자인 메시지의 이미지 업로드 — 파일을 에셋으로 올리고 돌아온 주소를 아이템에 반영해요 */
export function useDesignUpload(
	guildId: string,
	applyUrls: (index: number, kind: "section" | "media", urls: string[]) => void,
): DesignUpload {
	const toast = useToast();
	const singleFileInputRef = useRef<HTMLInputElement>(null);
	const multiFileInputRef = useRef<HTMLInputElement>(null);
	const uploadTargetRef = useRef<UploadTarget | null>(null);
	const [uploading, setUploading] = useState(false);

	const requestUpload = (target: UploadTarget) => {
		uploadTargetRef.current = target;
		if (target.kind === "section") singleFileInputRef.current?.click();
		else multiFileInputRef.current?.click();
	};

	const handleUpload = async (files: FileList | null) => {
		const target = uploadTargetRef.current;
		const list = Array.from(files ?? []);
		if (!target || list.length === 0) return;
		setUploading(true);
		try {
			const uploadedUrls: string[] = [];
			for (const file of list) {
				try {
					const asset = await uploadAssetFile(guildId, file);
					uploadedUrls.push(asset.url);
				} catch (err) {
					const apiError = toError(err, `\`${file.name}\` 업로드에 실패했어요.`);
					toast.error(apiError.message, apiError.retryable ? "잠시 후 다시 시도해 주세요." : undefined);
				}
			}
			if (uploadedUrls.length > 0) applyUrls(target.index, target.kind, uploadedUrls);
		} finally {
			setUploading(false);
		}
	};

	return { uploading, singleFileInputRef, multiFileInputRef, requestUpload, handleUpload };
}
