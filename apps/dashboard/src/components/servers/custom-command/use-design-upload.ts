import { useRef, useState } from "react";

import { useToast } from "@/components/ui/toast";
import { toError } from "@/lib/api-error";

import { uploadAssetFile } from "../asset-picker";

type UploadTarget = { index: number; kind: "section" | "media" };

export interface DesignUpload {
	uploading: boolean;
	singleFileInputRef: React.RefObject<HTMLInputElement | null>;
	multiFileInputRef: React.RefObject<HTMLInputElement | null>;
	requestUpload: (target: UploadTarget) => void;
	handleUpload: (files: FileList | null) => Promise<void>;
}

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
