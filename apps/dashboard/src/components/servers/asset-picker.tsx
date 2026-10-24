"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Images, RotateCcw, Upload } from "lucide-react";

import { EmptyState } from "@/components/primitives/empty-state";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
	ASSET_ALLOWED_MIME,
	ASSET_MAX_BYTES,
	type GuildAsset,
	useGuildAssets
} from "@/hooks/use-guild-assets";
import { ApiError, toApiError } from "@/lib/api-error";
import { notifyApiError } from "@/lib/notify";
import { cn } from "@/lib/utils";

/** 에셋 용량 표기 — assets-settings의 표기와 동일한 규칙이에요 */
function formatAssetSize(sizeBytes: number): string {
	if (sizeBytes >= 1024 * 1024) return `${(sizeBytes / (1024 * 1024)).toFixed(1)}MB`;
	return `${Math.max(1, Math.round(sizeBytes / 1024))}KB`;
}

interface AssetPickerProps {
	guildId: string;
	/** true면 여러 장을 골라 한 번에 넘겨요. false면 썸네일을 누르는 즉시 선택돼요 */
	multiple?: boolean;
	open: boolean;
	onClose: () => void;
	onSelect: (urls: string[]) => void;
}

/**
 * 에셋 업로드: 8MiB·mime 화이트리스트를 먼저 검사한 뒤 multipart로 올리고
 * 등록된 에셋(주소 포함)을 돌려줘요. 검증 실패는 ApiError(재시도 불가)로 거부해요.
 */
export async function uploadAssetFile(guildId: string, file: File): Promise<GuildAsset> {
	if (file.size > ASSET_MAX_BYTES) {
		throw new ApiError("이미지가 너무 커요. 최대 8MB까지 올릴 수 있어요.", false);
	}
	if (!(ASSET_ALLOWED_MIME as readonly string[]).includes(file.type)) {
		throw new ApiError("PNG, JPEG, WebP, GIF 이미지만 지원해요.", false);
	}
	const form = new FormData();
	form.append("file", file);
	const res = await fetch(`/api/servers/${guildId}/assets`, { method: "POST", body: form });
	if (!res.ok) throw await toApiError(res, "이미지를 올리지 못했어요.");
	const body = (await res.json()) as { asset?: GuildAsset };
	if (!body.asset?.url) throw new ApiError("이미지 업로드 응답이 올바르지 않아요.", false);
	return body.asset;
}

/**
 * 에셋 선택 다이얼로그: 길드에 올려둔 이미지를 골라 주소를 넘겨요.
 * 안에서도 바로 업로드할 수 있고, 올린 이미지는 목록에 반영돼 바로 선택돼요.
 */
export function AssetPicker({ guildId, multiple = false, open, onClose, onSelect }: AssetPickerProps) {
	const toast = useToast();
	const { assets, error, loading, refresh } = useGuildAssets(guildId);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
	const [uploading, setUploading] = useState(false);

	// 다이얼로그를 열 때마다 이전 선택을 비우고 목록을 다시 받아요
	useEffect(() => {
		if (!open) return;
		setSelectedUrls([]);
		refresh();
	}, [open, refresh]);

	const pickUrl = (url: string) => {
		if (!multiple) {
			onSelect([url]);
			onClose();
			return;
		}
		setSelectedUrls((prev) => (prev.includes(url) ? prev.filter((item) => item !== url) : [...prev, url]));
	};

	const confirmSelection = () => {
		if (selectedUrls.length === 0) return;
		onSelect(selectedUrls);
		onClose();
	};

	const handleUpload = async (files: FileList | null) => {
		const list = Array.from(files ?? []);
		if (list.length === 0) return;
		setUploading(true);
		try {
			const uploadedUrls: string[] = [];
			for (const file of list) {
				try {
					const asset = await uploadAssetFile(guildId, file);
					uploadedUrls.push(asset.url);
				} catch (err) {
					notifyApiError(err, `\`${file.name}\` 업로드에 실패했어요.`);
				}
			}
			if (uploadedUrls.length === 0) return;
			refresh();
			toast.success(
				uploadedUrls.length === list.length
					? `이미지 ${uploadedUrls.length}개를 업로드했어요.`
					: `이미지 ${uploadedUrls.length}개를 업로드했어요. 실패한 파일은 위에서 확인해 주세요.`
			);
			if (multiple) {
				setSelectedUrls((prev) => [...prev, ...uploadedUrls]);
				return;
			}
			onSelect(uploadedUrls.slice(0, 1));
			onClose();
		} finally {
			setUploading(false);
		}
	};

	const uploadButton = (
		<Button
			variant="secondary"
			size="sm"
			icon={<Upload size={16} />}
			loading={uploading}
			onClick={() => fileInputRef.current?.click()}
		>
			업로드
		</Button>
	);

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) onClose();
			}}
		>
			<DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>에셋에서 선택</DialogTitle>
					<DialogDescription>길드에 올려둔 이미지를 선택하거나 새로 올릴 수 있어요.</DialogDescription>
				</DialogHeader>

				<input
					ref={fileInputRef}
					type="file"
					accept={ASSET_ALLOWED_MIME.join(",")}
					multiple={multiple}
					className="hidden"
					onChange={(event) => {
						void handleUpload(event.target.files);
						event.target.value = "";
					}}
				/>

				{loading ? (
					<div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
						{Array.from({ length: 8 }, (_, index) => (
							<Skeleton key={index} className="aspect-square w-full rounded-control" />
						))}
					</div>
				) : error ? (
					<EmptyState
						icon={AlertCircle}
						size="sm"
						title="이미지를 불러오지 못했어요"
						description={error.message}
						action={
							<Button variant="secondary" icon={<RotateCcw size={16} />} onClick={refresh}>
								다시 시도
							</Button>
						}
					/>
				) : assets.length === 0 ? (
					<EmptyState
						icon={Images}
						size="sm"
						title="아직 등록된 에셋이 없어요"
						description="이미지를 올리면 여기에서 골라 명령어에 넣을 수 있어요."
						action={
							<Button variant="primary" icon={<Upload size={16} />} loading={uploading} onClick={() => fileInputRef.current?.click()}>
								이미지 올리기
							</Button>
						}
					/>
				) : (
					<div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
						{assets.map((asset) => {
							const isSelected = selectedUrls.includes(asset.url);
							return (
								<button
									key={asset.id}
									type="button"
									aria-pressed={multiple ? isSelected : undefined}
									aria-label={`${asset.name} 선택, ${formatAssetSize(asset.sizeBytes)}`}
									onClick={() => pickUrl(asset.url)}
									className={cn(
										"flex flex-col gap-1 rounded-control p-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
										isSelected ? "ring-2 ring-ring" : "hover:bg-muted/40"
									)}
								>
									<span className="relative block">
										{/* 등록된 에셋 주소는 임의 도메인이라 next/image remotePatterns로 등록할 수 없어요 */}
										{/* eslint-disable-next-line @next/next/no-img-element */}
										<img
											src={asset.url}
											alt=""
											loading="lazy"
											className="aspect-square w-full rounded-control object-cover"
										/>
										{multiple && isSelected && (
											<span className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-primary-control text-primary-control-text">
												<Check size={12} />
											</span>
										)}
									</span>
									<span className="truncate text-xs font-medium text-foreground">{asset.name}</span>
								</button>
							);
						})}
					</div>
				)}

				{assets.length > 0 && (
					<DialogFooter>
						{uploadButton}
						{multiple && (
							<Button variant="primary" size="sm" disabled={selectedUrls.length === 0} onClick={confirmSelection}>
								{`선택 완료(${selectedUrls.length})`}
							</Button>
						)}
					</DialogFooter>
				)}
			</DialogContent>
		</Dialog>
	);
}
