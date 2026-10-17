"use client";

import { useCallback, useState } from "react";
import useSWR from "swr";

import { useToast } from "@/components/ui/toast";
import { type ApiError, toApiError, toError } from "@/lib/api-error";

export interface GuildAsset {
	id: string;
	name: string;
	url: string;
	mimeType: string;
	sizeBytes: number;
	createdAt: string;
}

/** 업로드 상한 8MiB · 허용 mime 화이트리스트 (서버 계약과 동일하게 유지해요) */
export const ASSET_MAX_BYTES = 8 * 1024 * 1024;
export const ASSET_ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

interface GuildAssetsResponse {
	assets: GuildAsset[];
}

interface DeleteAssetResponse {
	ok: boolean;
	referencedBy: string[];
}

export interface UseGuildAssetsResult {
	assets: GuildAsset[];
	error: ApiError | null;
	loading: boolean;
	uploading: boolean;
	/** 파일을 순차적으로 업로드해요. 실패한 파일은 개별로 알려요. 모두 성공했는지 돌려줘요. */
	upload: (files: File[]) => Promise<boolean>;
	rename: (id: string, name: string) => Promise<boolean>;
	remove: (id: string) => Promise<boolean>;
	refresh: () => void;
}

type ToastApi = ReturnType<typeof useToast>;

/** 액션 실패 토스트 — 서버의 한국어 메시지를 우선 보여주고, 재시도 가능한 오류만 안내를 덧붙여요 */
function reportError(toast: ToastApi, error: unknown, fallback: string): void {
	const apiError = toError(error, fallback);
	toast.error(apiError.message, apiError.retryable ? "잠시 후 다시 시도해 주세요." : undefined);
}

/**
 * 길드 이미지 에셋 — 목록 조회(SWR)와 업로드·이름 변경·삭제 액션을 한곳에서 관리해요.
 * 목록은 전역 SWR fetcher 설정을 쓰므로 키만 넘기고, 액션은 성공 후 mutate로 재검증해요.
 */
export function useGuildAssets(guildId: string): UseGuildAssetsResult {
	const toast = useToast();
	const { data, error, isLoading, mutate } = useSWR<GuildAssetsResponse>(`/api/servers/${guildId}/assets`);
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
						const res = await fetch(`/api/servers/${guildId}/assets`, { method: "POST", body: form });
						if (!res.ok) throw await toApiError(res, `\`${file.name}\` 업로드에 실패했어요.`);
						uploaded += 1;
					} catch (error) {
						reportError(toast, error, `\`${file.name}\` 업로드에 실패했어요.`);
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
		[guildId, mutate, toast]
	);

	const rename = useCallback(
		async (id: string, name: string): Promise<boolean> => {
			try {
				const res = await fetch(`/api/servers/${guildId}/assets/${id}`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name })
				});
				if (!res.ok) throw await toApiError(res, "이미지 이름 변경에 실패했어요.");
				await mutate();
				toast.success(`\`${name}\`(으)로 이름을 바꿨어요.`);
				return true;
			} catch (error) {
				reportError(toast, error, "이미지 이름 변경에 실패했어요.");
				return false;
			}
		},
		[guildId, mutate, toast]
	);

	const remove = useCallback(
		async (id: string): Promise<boolean> => {
			try {
				const res = await fetch(`/api/servers/${guildId}/assets/${id}`, { method: "DELETE" });
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
				reportError(toast, error, "이미지 삭제에 실패했어요.");
				return false;
			}
		},
		[guildId, mutate, toast]
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
