"use client";

import { useCallback, useState } from "react";

import { useToast } from "@/components/ui/toast";
import { type ApiError, toApiError, toError } from "@/lib/api-error";
import { notifyApiError } from "@/lib/notify";
import { createApiFetcher, useGuildResource } from "@/lib/swr";

export interface GuildAsset {
	id: string;
	name: string;
	url: string;
	mimeType: string;
	sizeBytes: number;
	createdAt: string;
}

export const ASSET_MAX_BYTES = 8 * 1024 * 1024;
export const ASSET_ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

interface GuildAssetsResponse {
	assets: GuildAsset[];
}

interface DeleteAssetResponse {
	ok: boolean;
	referencedBy: string[];
}

interface UseGuildAssetsResult {
	assets: GuildAsset[];
	error: ApiError | null;
	loading: boolean;
	uploading: boolean;
	upload: (files: File[]) => Promise<boolean>;
	rename: (id: string, name: string) => Promise<boolean>;
	remove: (id: string) => Promise<boolean>;
	refresh: () => void;
}

const assetsFetcher = createApiFetcher<GuildAssetsResponse>("이미지 에셋을 불러오지 못했어요.");

export function useGuildAssets(guildId: string): UseGuildAssetsResult {
	const toast = useToast();
	const { data, error, isLoading, mutate, guildUrl } = useGuildResource<GuildAssetsResponse>(guildId, "/assets", { fetcher: assetsFetcher });
	const [uploading, setUploading] = useState(false);

	const upload = useCallback(
		async (files: File[]): Promise<boolean> => {
			if (files.length === 0) return false;
			setUploading(true);
			let uploaded = 0;
			try {
				for (const file of files) {
					try {
						const form = new FormData();
						form.append("file", file);
						const res = await fetch(guildUrl, { method: "POST", body: form });
						if (!res.ok) throw await toApiError(res, `\`${file.name}\` 업로드에 실패했어요.`);
						uploaded += 1;
					} catch (error) {
						notifyApiError(error, `\`${file.name}\` 업로드에 실패했어요.`);
					}
				}
				if (uploaded > 0) {
					toast.success(
						uploaded === files.length
							? `이미지 ${uploaded}개를 업로드했어요.`
							: `이미지 ${uploaded}개를 업로드했어요. 실패한 파일은 위에서 확인해 주세요.`
					);
					await mutate();
				}
				return uploaded === files.length;
			} finally {
				setUploading(false);
			}
		},
		[guildUrl, mutate, toast]
	);

	const rename = useCallback(
		async (id: string, name: string): Promise<boolean> => {
			try {
				const res = await fetch(`${guildUrl}/${id}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name })
				});
				if (!res.ok) throw await toApiError(res, "이미지 이름 변경에 실패했어요.");
				await mutate();
				toast.success(`\`${name}\`(으)로 이름을 바꿨어요.`);
				return true;
			} catch (error) {
				notifyApiError(error, "이미지 이름 변경에 실패했어요.");
				return false;
			}
		},
		[guildUrl, mutate, toast]
	);

	const remove = useCallback(
		async (id: string): Promise<boolean> => {
			try {
				const res = await fetch(`${guildUrl}/${id}`, { method: "DELETE" });
				if (!res.ok) throw await toApiError(res, "이미지 삭제에 실패했어요.");
				const data = (await res.json()) as Partial<DeleteAssetResponse>;
				await mutate();
				toast.success("이미지를 삭제했어요.");
				const referencedBy = data.referencedBy ?? [];
				if (referencedBy.length > 0) {
					toast.warning(`이 이미지를 쓰는 명령어: ${referencedBy.join(", ")}`, "명령어의 이미지 주소가 사라지니 새 이미지로 지정해 주세요.");
				}
				return true;
			} catch (error) {
				notifyApiError(error, "이미지 삭제에 실패했어요.");
				return false;
			}
		},
		[guildUrl, mutate, toast]
	);

	const refresh = useCallback(() => {
		void mutate();
	}, [mutate]);

	return {
		assets: data?.assets ?? [],
		error: error ? toError(error, "이미지 에셋을 불러오지 못했어요.") : null,
		loading: isLoading,
		uploading,
		upload,
		rename,
		remove,
		refresh
	};
}
