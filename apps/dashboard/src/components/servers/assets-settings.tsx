"use client";

import { useRef, useState } from "react";
import { Check, Copy, Images, Pencil, Trash2, Upload, X } from "lucide-react";

import { EmptyState } from "@/components/primitives/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useConfirmDelete } from "@/hooks/use-confirm-delete";
import {
  ASSET_ALLOWED_MIME,
  ASSET_MAX_BYTES,
  type GuildAsset,
  useGuildAssets,
} from "@/hooks/use-guild-assets";

import { InfoBox, PanelError, PanelHeader, PanelLoading } from "./settings-shared";

const assetDateFormat = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

/** 에셋 용량 표기 — 1MB 미만은 KB, 그 이상은 소수점 한 자리 MB */
function formatAssetSize(sizeBytes: number): string {
  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)}MB`;
  }
  return `${Math.max(1, Math.round(sizeBytes / 1024))}KB`;
}

function AssetsPanel({ guildId }: { guildId: string }) {
  const toast = useToast();
  const {
    assets,
    error: loadError,
    loading,
    uploading,
    upload,
    rename,
    remove,
    refresh,
  } = useGuildAssets(guildId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const { armedId: confirmDeleteId, request: requestDelete } = useConfirmDelete();

  const handleFiles = async (files: File[]) => {
    const accepted: File[] = [];
    for (const file of files) {
      if (!(ASSET_ALLOWED_MIME as readonly string[]).includes(file.type)) {
        toast.error(
          `\`${file.name}\` 파일은 지원하지 않는 형식이에요.`,
          "PNG, JPEG, WebP, GIF 이미지만 올릴 수 있어요.",
        );
        continue;
      }
      if (file.size > ASSET_MAX_BYTES) {
        toast.error(
          `\`${file.name}\` 파일이 너무 커요.`,
          "이미지 하나당 최대 8MB까지 올릴 수 있어요.",
        );
        continue;
      }
      accepted.push(file);
    }
    if (accepted.length > 0) await upload(accepted);
  };

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    void handleFiles(files);
  };

  const startRename = (asset: GuildAsset) => {
    setEditingId(asset.id);
    setDraftName(asset.name);
  };

  const handleRename = async (asset: GuildAsset) => {
    const name = draftName.trim();
    if (!name) {
      toast.error("이미지 이름을 입력해 주세요.");
      return;
    }
    setSavingName(true);
    try {
      if (await rename(asset.id, name)) setEditingId(null);
    } finally {
      setSavingName(false);
    }
  };

  const handleCopyUrl = async (asset: GuildAsset) => {
    try {
      await navigator.clipboard.writeText(asset.url);
      toast.success("이미지 주소를 복사했어요.");
    } catch {
      toast.error("이미지 주소를 복사하지 못했어요.");
    }
  };

  const handleDelete = async (asset: GuildAsset) => {
    // 첫 클릭은 무장(4초 자동 해제), 두 번째 클릭이 실제 삭제예요
    if (!requestDelete(asset.id)) return;
    await remove(asset.id);
  };

  if (loading) return <PanelLoading label="이미지 에셋 불러오는 중…" />;
  if (loadError)
    return (
      <PanelError
        error={loadError}
        onRetry={() => {
          refresh();
        }}
      />
    );

  return (
    <Card padding="lg" className="gap-6 overflow-visible">
      <PanelHeader
        icon={<Images className="h-5 w-5" />}
        title="이미지 에셋"
        description="커스텀 명령어의 썸네일·갤러리에 쓰는 이미지를 한곳에서 관리해요."
        action={
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={handleFileInput}
            />
            <Button
              variant="primary"
              size="sm"
              icon={<Upload size={16} />}
              loading={uploading}
              className="pointer-coarse:h-11"
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? "올리는 중…" : "이미지 올리기"}
            </Button>
          </>
        }
      />

      {assets.length === 0 ? (
        <EmptyState
          icon={Images}
          title="등록된 이미지가 없어요"
          description="이미지를 올리면 커스텀 명령어의 썸네일·갤러리에서 바로 쓸 수 있어요."
          action={
            <Button
              variant="primary"
              icon={<Upload size={16} />}
              disabled={uploading}
              className="pointer-coarse:h-11"
              onClick={() => fileInputRef.current?.click()}
            >
              첫 이미지 올리기
            </Button>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((asset) => (
            <li key={asset.id}>
              <Card padding="sm" className="h-full gap-3">
                <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-control bg-surface-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={asset.url}
                    alt={asset.name}
                    loading="lazy"
                    className="h-full w-full object-contain"
                  />
                </div>

                {editingId === asset.id ? (
                  <div className="flex flex-col gap-2">
                    <Input
                      value={draftName}
                      maxLength={100}
                      aria-label="이미지 이름"
                      disabled={savingName}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setDraftName(e.target.value)
                      }
                      onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                        if (e.key === "Enter") void handleRename(asset);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        icon={<Check size={14} />}
                        loading={savingName}
                        className="pointer-coarse:h-11"
                        onClick={() => void handleRename(asset)}
                      >
                        저장
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<X size={14} />}
                        disabled={savingName}
                        className="pointer-coarse:h-11"
                        onClick={() => setEditingId(null)}
                      >
                        취소
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 break-all text-sm font-semibold text-foreground">
                      {asset.name}
                    </p>
                    <Button
                      variant="icon"
                      size="sm"
                      aria-label={`${asset.name} 이름 수정`}
                      icon={<Pencil size={14} />}
                      className="pointer-coarse:h-11"
                      onClick={() => startRename(asset)}
                    />
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  {formatAssetSize(asset.sizeBytes)} ·{" "}
                  {assetDateFormat.format(new Date(asset.createdAt))}
                </p>

                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Copy size={14} />}
                    className="pointer-coarse:h-11"
                    onClick={() => void handleCopyUrl(asset)}
                  >
                    주소 복사
                  </Button>
                  <Button
                    variant="icon"
                    size="sm"
                    aria-label={`${asset.name} 삭제`}
                    className={`pointer-coarse:h-11 ${
                      confirmDeleteId === asset.id ? "ring-2 ring-destructive/50" : ""
                    }`}
                    icon={
                      confirmDeleteId === asset.id ? (
                        <Trash2 size={14} className="text-destructive" />
                      ) : (
                        <Trash2 size={14} />
                      )
                    }
                    onClick={() => void handleDelete(asset)}
                  />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <InfoBox>
        <p>
          PNG, JPEG, WebP, GIF 형식으로 이미지 하나당 최대{" "}
          <span className="font-semibold text-foreground">8MB</span>까지 올릴 수
          있어요.
        </p>
        <p>
          올린 이미지의 주소는 커스텀 명령어의 썸네일·미디어 갤러리에 붙여 넣어
          쓸 수 있고, 삭제하면 그 주소를 쓰는 명령어 이름을 알려드려요.
        </p>
      </InfoBox>
    </Card>
  );
}

export function AssetsSettings({ guildId }: { guildId: string }) {
  return <AssetsPanel guildId={guildId} />;
}
