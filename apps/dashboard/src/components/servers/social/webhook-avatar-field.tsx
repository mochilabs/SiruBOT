"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, RotateCcw, UserRoundCog } from "lucide-react";

import { Field } from "@/components/primitives/field";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { toApiError } from "@/lib/api-error";
import { notifyApiError } from "@/lib/notify";

const MAX_AVATAR_BYTES = 3 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = "image/png,image/jpeg,image/gif,image/webp";
const ACCEPTED_MIME = new Set(ACCEPTED_IMAGE_TYPES.split(","));

interface WebhookAvatarFieldProps {
	guildId: string;
	value: string | null;
	onChange: (url: string | null) => void;
	fallbackGuildAvatarUrl?: string | null;
	fallbackGlobalAvatarUrl?: string | null;
	disabled?: boolean;
}

export function WebhookAvatarField({
	guildId,
	value,
	onChange,
	fallbackGuildAvatarUrl = null,
	fallbackGlobalAvatarUrl = null,
	disabled = false,
}: WebhookAvatarFieldProps) {
	const toast = useToast();
	const [file, setFile] = useState<File | null>(null);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);
	const [uploading, setUploading] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!file) {
			setPreviewUrl(null);
			return;
		}
		const url = URL.createObjectURL(file);
		setPreviewUrl(url);
		return () => URL.revokeObjectURL(url);
	}, [file]);

	const handlePick = async (picked: File | null) => {
		if (!picked) return;
		if (picked.size > MAX_AVATAR_BYTES) {
			toast.error("이미지가 너무 커요. 최대 3MB까지 올릴 수 있어요.");
			return;
		}
		if (!ACCEPTED_MIME.has(picked.type)) {
			toast.error("PNG, JPEG, GIF, WebP 이미지만 지원해요.");
			return;
		}
		setFile(picked);
		setUploading(true);
		try {
			const form = new FormData();
			form.append("file", picked);
			const res = await fetch(`/api/servers/${guildId}/assets`, { method: "POST", body: form });
			if (!res.ok) throw await toApiError(res, "프로필 사진을 업로드하지 못했어요.");
			const payload = (await res.json()) as { asset?: { url?: string } } | null;
			const url = payload?.asset?.url;
			if (!url) throw new Error("업로드한 이미지 주소를 받지 못했어요.");
			onChange(url);
		} catch (error) {
			notifyApiError(error, "프로필 사진을 업로드하지 못했어요.");
			setFile(null);
		} finally {
			setUploading(false);
		}
	};

	const handleReset = () => {
		setFile(null);
		onChange(null);
	};

	const preview = previewUrl ?? value ?? fallbackGuildAvatarUrl ?? fallbackGlobalAvatarUrl;
	const caption = previewUrl
		? uploading
			? "이미지를 업로드하는 중이에요."
			: "새 프로필 사진 미리보기에요."
		: value
			? "커스텀 프로필 사진으로 보내요."
			: fallbackGuildAvatarUrl
				? "이 서버 봇 프로필 사진을 그대로 써요."
				: "기본 프로필 사진으로 보내요.";
	const canClear = Boolean(value) || Boolean(file);

	return (
		<Field label="프로필 사진" description={caption}>
			<div className="flex flex-wrap items-center gap-3">
				<span className="relative inline-flex h-12 w-12 shrink-0 overflow-hidden rounded-full bg-surface-2 ring-2 ring-border-subtle">
					{preview ? (
						// eslint-disable-next-line @next/next/no-img-element
						<img src={preview} alt="웹훅 프로필 사진 미리보기" className="h-full w-full object-cover" />
					) : (
						<UserRoundCog className="m-auto h-5 w-5 text-muted-foreground" aria-hidden />
					)}
				</span>
				<div className="flex flex-wrap items-center gap-2">
					<input
						ref={inputRef}
						type="file"
						accept={ACCEPTED_IMAGE_TYPES}
						className="sr-only"
						onChange={(event) => {
							void handlePick(event.target.files?.[0] ?? null);
							event.target.value = "";
						}}
					/>
					<Button
						variant="secondary"
						size="sm"
						icon={uploading ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
						onClick={() => inputRef.current?.click()}
						disabled={disabled || uploading}
					>
						{uploading ? "업로드 중…" : "이미지 변경"}
					</Button>
					{canClear && (
						<Button
							variant="ghost"
							size="sm"
							icon={<RotateCcw size={14} />}
							onClick={handleReset}
							disabled={disabled || uploading}
						>
							기본값
						</Button>
					)}
				</div>
			</div>
		</Field>
	);
}
