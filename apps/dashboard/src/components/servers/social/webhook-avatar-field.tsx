"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, RotateCcw, UserRoundCog } from "lucide-react";

import { Field } from "@/components/primitives/field";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { toApiError } from "@/lib/api-error";
import { notifyApiError } from "@/lib/notify";

/** 봇 프로필 설정과 동일한 제한·문구를 써요 (3MB · PNG/JPEG/GIF/WebP). */
const MAX_AVATAR_BYTES = 3 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = "image/png,image/jpeg,image/gif,image/webp";
const ACCEPTED_MIME = new Set(ACCEPTED_IMAGE_TYPES.split(","));

interface WebhookAvatarFieldProps {
	guildId: string;
	/** 저장된 커스텀 웹훅 아바타 URL — null이면 서버/기본 아바타로 보내요 */
	value: string | null;
	onChange: (url: string | null) => void;
	/** 폴백 미리보기 — 이 서버(길드) 전용 봇 프로필 사진 */
	fallbackGuildAvatarUrl?: string | null;
	/** 폴백 미리보기 — 전역(앱) 봇 프로필 사진 */
	fallbackGlobalAvatarUrl?: string | null;
	disabled?: boolean;
}

/**
 * 소셜 알림 웹훅 프로필 사진 — 봇 프로필 설정과 같은 업로드·미리보기·폴백 흐름이에요.
 * URL을 직접 입력하는 대신 파일을 올리고(기존 길드 에셋 업로드 경로 재사용), 미리보기를 보여줘요.
 * 저장된 값은 항상 업로드가 발급한 공개 https URL이에요.
 */
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

	// 파일 미리보기 — 교체/해제 시 이전 URL을 즉시 회수해요.
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
			setFile(null); // 업로드에 실패하면 미리보기를 되돌려요.
		} finally {
			setUploading(false);
		}
	};

	const handleReset = () => {
		setFile(null);
		onChange(null);
	};

	// 미리보기: 방금 고른 파일 → 저장된 커스텀 → 서버 프로필 → 전역 아바타 순서 (봇 프로필과 동일).
	const preview = previewUrl ?? value ?? fallbackGuildAvatarUrl ?? fallbackGlobalAvatarUrl;
	const caption = previewUrl
		? uploading
			? "이미지를 업로드하는 중이에요."
			: "새 프로필 사진 미리보기에요. 저장하면 웹훅 프로필 사진으로 보내요."
		: value
			? "커스텀 프로필 사진으로 보낼 거예요."
			: fallbackGuildAvatarUrl
				? "이 서버 봇 프로필 사진을 그대로 써요."
				: "기본 프로필 사진으로 보내요. 이 서버에만 다른 사진을 넣을 수 있어요.";
	const canClear = Boolean(value) || Boolean(file);

	return (
		<Field label="프로필 사진" description={caption}>
			<div className="flex items-center gap-3">
				<span className="relative inline-flex h-16 w-16 shrink-0 overflow-hidden rounded-full bg-surface-2">
					{preview ? (
						// eslint-disable-next-line @next/next/no-img-element
						<img src={preview} alt="웹훅 프로필 사진 미리보기" className="h-full w-full object-cover" />
					) : (
						<UserRoundCog className="m-auto h-6 w-6 text-muted-foreground" aria-hidden />
					)}
				</span>
				<div className="flex flex-col items-start gap-2">
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
						{uploading ? "업로드 중…" : "이미지 선택"}
					</Button>
					{canClear && (
						<Button
							variant="ghost"
							size="sm"
							icon={<RotateCcw size={14} />}
							onClick={handleReset}
							disabled={disabled || uploading}
						>
							기본 아바타 사용
						</Button>
					)}
				</div>
			</div>
		</Field>
	);
}
