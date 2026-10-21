import { useCallback, useState } from "react";

import { useToast } from "@/components/ui/toast";
import { toApiError, toError } from "@/lib/api-error";
import type { GreetingImage, GreetingLayer } from "@/types/member-greeting";

import { createImageLayer, loadImage } from "./greeting-draw";

const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
/** 업로드·파일 입력이 같이 쓰는 허용 이미지 타입 */
const ACCEPTED_IMAGE_TYPES = "image/png,image/jpeg,image/webp";
export { ACCEPTED_IMAGE_TYPES };

export interface GreetingUpload {
  uploading: boolean;
  backgroundUploading: boolean;
  handleImageUpload: (file: File | null) => Promise<void>;
  handleBackgroundUpload: (file: File | null) => Promise<void>;
}

/**
 * 인사 카드 이미지 업로드 — 이미지 레이어 추가와 커스텀 배경 교체 두 경로가 있어요.
 * POST /background 계열 엔드포인트로 보내 dataURI 정규화를 재사용해요.
 */
export function useGreetingUpload({
  guildId,
  image,
  patchImage,
  commit,
  addLayer,
}: {
  guildId: string;
  image: GreetingImage;
  patchImage: (next: GreetingImage) => void;
  commit: () => void;
  addLayer: (layer: GreetingLayer) => void;
}): GreetingUpload {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const [backgroundUploading, setBackgroundUploading] = useState(false);

  const uploadFile = useCallback(
    async (
      file: File | null,
      mode: "layer" | "background",
    ): Promise<string | null> => {
      if (!file) return null;
      if (file.size > MAX_UPLOAD_BYTES) {
        toast.error("이미지가 너무 커요. 최대 3MB까지 올릴 수 있어요.");
        return null;
      }
      if (!`${ACCEPTED_IMAGE_TYPES},`.includes(`${file.type},`)) {
        toast.error("PNG, JPEG, WebP 이미지만 지원해요.");
        return null;
      }
      const form = new FormData();
      form.append("file", file);
      const endpoint = mode === "layer" ? "layer-image" : "background";
      const res = await fetch(`/api/servers/${guildId}/greeting/${endpoint}`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw await toApiError(res, "이미지를 준비하지 못했어요.");
      const body = (await res.json()) as { dataUri?: unknown };
      if (
        typeof body.dataUri !== "string" ||
        !body.dataUri.startsWith("data:image/")
      ) {
        throw new Error("이미지 응답이 올바르지 않아요.");
      }
      return body.dataUri;
    },
    [guildId, toast],
  );

  const handleImageUpload = useCallback(
    async (file: File | null) => {
      setUploading(true);
      try {
        const dataUri = await uploadFile(file, "layer");
        if (!dataUri) return;
        const img = await loadImage(dataUri);
        let width = 400;
        let height = 400;
        if (img && img.naturalWidth > 0) {
          width = 400;
          height = Math.max(
            1,
            Math.round((400 * img.naturalHeight) / img.naturalWidth),
          );
        }
        addLayer(createImageLayer(dataUri, width, height));
        toast.success("이미지 레이어를 추가했어요.");
      } catch (err) {
        const apiError = toError(err, "이미지를 준비하지 못했어요.");
        toast.error(
          apiError.message,
          apiError.retryable ? "잠시 후 다시 시도해 주세요." : undefined,
        );
      } finally {
        setUploading(false);
      }
    },
    [addLayer, uploadFile, toast],
  );

  const handleBackgroundUpload = useCallback(
    async (file: File | null) => {
      setBackgroundUploading(true);
      try {
        const dataUri = await uploadFile(file, "background");
        if (!dataUri) return;
        patchImage({ ...image, background: { presetId: null, dataUri } });
        commit();
        toast.success(
          "배경 이미지를 넣었어요.",
          "인사 설정을 저장하면 모든 카드에 적용돼요.",
        );
      } catch (err) {
        const apiError = toError(err, "배경 이미지를 준비하지 못했어요.");
        toast.error(
          apiError.message,
          apiError.retryable ? "잠시 후 다시 시도해 주세요." : undefined,
        );
      } finally {
        setBackgroundUploading(false);
      }
    },
    [image, patchImage, commit, uploadFile, toast],
  );

  return { uploading, backgroundUploading, handleImageUpload, handleBackgroundUpload };
}
