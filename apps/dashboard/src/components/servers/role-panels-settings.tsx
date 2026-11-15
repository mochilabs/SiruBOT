"use client";

import { useCallback, useRef, useState } from "react";
import type { RolePanelButton } from "@sirubot/utils/rolePanel";
import {
  isValidRolePanelEmoji,
  ROLE_PANEL_MAX_BUTTONS,
  ROLE_PANEL_MAX_REACTIONS,
  type RolePanelMode,
  validateReactionButtons,
} from "@sirubot/utils/rolePanel";
import {
  Images,
  Loader2,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import useSWR from "swr";

import { ChannelSelect } from "@/components/discord/channel-select";
import { CHANNEL_TYPE_GROUP } from "@/components/discord/discord-options";
import { RoleSelect } from "@/components/discord/role-select";
import { EmptyState } from "@/components/primitives/empty-state";
import { Field } from "@/components/primitives/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ASSET_ALLOWED_MIME } from "@/hooks/use-guild-assets";
import { useGuildChannels, useGuildRoles } from "@/hooks/use-guild-settings";
import { toApiError, toError } from "@/lib/api-error";
import { notifyApiError, notifySaved } from "@/lib/notify";
import { createApiFetcher } from "@/lib/swr";
import { cn } from "@/lib/utils";

import { AssetPicker, uploadAssetFile } from "./asset-picker";
import {
  ChannelListError,
  InfoBox,
  PanelError,
  PanelHeader,
  PanelLoading,
} from "./settings-shared";

interface RolePanelWithButtons {
  id: string;
  guildId: string;
  name: string;
  title: string;
  description: string;
  imageUrl: string | null;
  mode: RolePanelMode;
  clickCount: number;
  channelId: string | null;
  messageId: string | null;
  createdAt: string;
  updatedAt: string;
  buttons: RolePanelButton[];
}

const listFetcher = createApiFetcher<RolePanelWithButtons[]>(
  "역할 패널 목록을 불러오지 못했어요.",
  { sessionRetry: true },
);

const MODE_LABELS: Record<RolePanelMode, string> = {
  button: "버튼 (클릭해서 받기)",
  reaction: "반응 (이모지로 받기)",
};

const BUTTON_STYLES = ["secondary", "primary", "success", "danger"] as const;

const BUTTON_STYLE_META: Record<
  RolePanelButton["style"],
  { label: string; dotClass: string; previewClass: string }
> = {
  secondary: {
    label: "회색 (기본)",
    dotClass: "bg-muted-foreground/70",
    previewClass: "bg-surface-3 text-foreground",
  },
  primary: {
    label: "파랑 (강조)",
    dotClass: "bg-[#5865F2]",
    previewClass: "bg-[#5865F2] text-white",
  },
  success: {
    label: "초록 (긍정)",
    dotClass: "bg-success",
    previewClass: "bg-success text-white",
  },
  danger: {
    label: "빨강 (주의)",
    dotClass: "bg-destructive",
    previewClass: "bg-destructive text-destructive-foreground",
  },
};

export function RolePanelsSettings({ guildId }: { guildId: string }) {
  const url = `/api/servers/${guildId}/role-panels`;
  const { data, error, isLoading, mutate } = useSWR<RolePanelWithButtons[]>(
    url,
    listFetcher,
  );

  const {
    roles,
    error: rolesError,
    reload: reloadRoles,
  } = useGuildRoles(guildId, true);

  const [busyId, setBusyId] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    setBusyId("__create__");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `역할 패널 ${(data?.length ?? 0) + 1}` }),
      });
      if (!res.ok) throw await toApiError(res, "역할 패널을 만들지 못했어요.");
      await mutate();
      notifySaved("역할 패널을 만들었어요.");
    } catch (err) {
      notifyApiError(err, "생성에 실패했어요.");
    } finally {
      setBusyId(null);
    }
  }, [url, data, mutate]);

  const handlePost = useCallback(
    async (panel: RolePanelWithButtons, channelId: string | null) => {
      setBusyId(panel.id);
      try {
        const res = await fetch(`${url}/${panel.id}/post`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(channelId ? { channelId } : {}),
        });
        if (!res.ok) throw await toApiError(res, "패널을 게시하지 못했어요.");
        await mutate();
        notifySaved("역할 패널을 게시했어요.");
      } catch (err) {
        notifyApiError(err, "게시에 실패했어요.");
      } finally {
        setBusyId(null);
      }
    },
    [url, mutate],
  );

  const handleDelete = useCallback(
    async (panel: RolePanelWithButtons) => {
      setBusyId(panel.id);
      try {
        const res = await fetch(`${url}/${panel.id}`, { method: "DELETE" });
        if (!res.ok)
          throw await toApiError(res, "역할 패널을 삭제하지 못했어요.");
        await mutate();
        notifySaved("역할 패널을 삭제했어요.");
      } catch (err) {
        notifyApiError(err, "삭제에 실패했어요.");
      } finally {
        setBusyId(null);
      }
    },
    [url, mutate],
  );

  if (isLoading) return <PanelLoading label="역할 패널 불러오는 중" />;
  if (error) {
    return (
      <PanelError
        error={toError(error, "역할 패널 목록을 불러오지 못했어요.")}
        onRetry={() => mutate()}
      />
    );
  }

  const panels = data ?? [];

  return (
    <div className="space-y-6">
      <PanelHeader
        icon={<ShieldCheck size={20} />}
        title="역할 패널"
        description="유저가 버튼을 눌러 스스로 역할을 받거나 해제할 수 있는 패널이에요. 여러 개를 만들 수 있어요."
      />

      <InfoBox>
        패널을 만들고 역할 버튼을 추가한 뒤 저장하세요. 게시는 이 화면의{" "}
        <code>게시</code> 버튼 또는 디스코드 <code>/역할패널 게시</code>{" "}
        명령어로 할 수 있어요. 이미 게시된 패널은 저장하면 메시지에 바로
        반영돼요.
      </InfoBox>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {panels.length}개 패널
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleCreate}
          disabled={busyId === "__create__"}
        >
          <Plus size={14} /> 새 패널
        </Button>
      </div>

      {panels.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="아직 역할 패널이 없어요"
          description="새 패널을 만들어 유저가 스스로 역할을 받거나 해제할 수 있게 해보세요."
          size="sm"
        />
      ) : (
        panels.map((panel) => (
          <RolePanelCard
            key={panel.id}
            guildId={guildId}
            panel={panel}
            roles={roles}
            rolesError={rolesError}
            reloadRoles={reloadRoles}
            busy={busyId === panel.id}
            onPost={(channelId) => handlePost(panel, channelId)}
            onDelete={() => handleDelete(panel)}
            onMutate={() => mutate()}
          />
        ))
      )}
    </div>
  );
}

function RolePanelCard({
  guildId,
  panel,
  roles,
  rolesError,
  reloadRoles,
  busy,
  onPost,
  onDelete,
  onMutate,
}: {
  guildId: string;
  panel: RolePanelWithButtons;
  roles: ReturnType<typeof useGuildRoles>["roles"];
  rolesError: ReturnType<typeof useGuildRoles>["error"];
  reloadRoles: () => void;
  busy: boolean;
  onPost: (channelId: string | null) => void;
  onDelete: () => void;
  onMutate: () => Promise<unknown>;
}) {
  const url = `/api/servers/${guildId}/role-panels/${panel.id}`;
  const [name, setName] = useState(panel.name);
  const [title, setTitle] = useState(panel.title);
  const [description, setDescription] = useState(panel.description);
  const [imageUrl, setImageUrl] = useState<string | null>(
    panel.imageUrl ?? null,
  );
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<RolePanelMode>(panel.mode ?? "button");
  const [buttons, setButtons] = useState<RolePanelButton[]>(panel.buttons);
  const [saving, setSaving] = useState(false);
  const [postChannelId, setPostChannelId] = useState<string>(
    panel.channelId ?? "",
  );
  const {
    channels,
    error: channelsError,
    reload: reloadChannels,
  } = useGuildChannels(guildId, true);

  const maxItems =
    mode === "reaction" ? ROLE_PANEL_MAX_REACTIONS : ROLE_PANEL_MAX_BUTTONS;

  const handleImageUpload = async (file: File | null) => {
    if (!file) return;
    setUploadingImage(true);
    try {
      const asset = await uploadAssetFile(guildId, file);
      setImageUrl(asset.url);
    } catch (err) {
      notifyApiError(err, "이미지를 업로드하지 못했어요.");
    } finally {
      setUploadingImage(false);
    }
  };

  const addButton = () => {
    if (buttons.length >= maxItems) return;
    setButtons((prev) => [
      ...prev,
      {
        id: `temp-${Date.now()}`,
        roleId: "",
        label: "",
        emoji: null,
        style: "secondary",
        position: prev.length,
      },
    ]);
  };

  const updateButton = (id: string, partial: Partial<RolePanelButton>) => {
    setButtons((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...partial } : b)),
    );
  };

  const removeButton = (id: string) => {
    setButtons((prev) => prev.filter((b) => b.id !== id));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // 역할 유효성 검증은 서버(PUT)가 봇에 확인해요 — 부여 불가 역할이면 400으로 사유를 돌려줘요.
      const filled = buttons.filter((b) => b.roleId);
      const badEmoji = filled.find(
        (b) => b.emoji && !isValidRolePanelEmoji(b.emoji),
      );
      if (badEmoji) {
        notifyApiError(
          "올바른 이모지가 아니에요. 유니코드 이모지(😀)나 서버 커스텀 이모지(<:이름:ID>)만 쓸 수 있어요.",
          "저장에 실패했어요.",
        );
        return;
      }
      const reactionError =
        mode === "reaction" ? validateReactionButtons(filled) : null;
      if (reactionError) {
        notifyApiError(reactionError, "저장에 실패했어요.");
        return;
      }
      const payload = {
        name,
        title,
        description,
        imageUrl,
        mode,
        buttons: buttons
          .filter((b) => b.roleId)
          .map((b, index) => ({
            // 서버에 이미 있는 버튼만 id를 보내요 — id가 유지돼야 게시된 메시지의 버튼이 계속 동작해요.
            ...(b.id.startsWith("temp-") ? {} : { id: b.id }),
            roleId: b.roleId,
            label: b.label,
            emoji: b.emoji,
            style: b.style,
            position: index,
          })),
      };
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        notifyApiError(
          await toApiError(res, "역할 패널을 저장하지 못했어요."),
          "저장에 실패했어요.",
        );
        return;
      }
      await onMutate();
      notifySaved("역할 패널을 저장했어요.");
    } catch (err) {
      notifyApiError(err, "저장에 실패했어요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card padding="lg" className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-bold text-foreground">{panel.name}</h3>
            <Badge variant={panel.channelId ? "success" : "secondary"}>
              {panel.channelId ? "게시됨" : "미게시"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            총 {panel.clickCount}회 클릭
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onPost(postChannelId || null)}
            disabled={
              busy ||
              buttons.length === 0 ||
              !(postChannelId || panel.channelId)
            }
          >
            <Send size={14} /> 게시
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            disabled={busy}
            aria-label="삭제"
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      <Field
        label="게시 채널"
        description="게시 버튼을 누르면 이 채널에 패널을 올려요. 이미 게시된 패널을 다시 게시하면 이전 메시지는 지워져요."
      >
        {channelsError ? (
          <ChannelListError error={channelsError} onRetry={reloadChannels} />
        ) : (
          <ChannelSelect
            channels={channels}
            value={postChannelId}
            onChange={(val) => setPostChannelId(val)}
            types={CHANNEL_TYPE_GROUP.chat}
            noneLabel="채널 선택 안 함"
            disabled={busy}
            placeholder="게시할 채널을 선택해 주세요"
          />
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="패널 이름" description="목록에서 식별할 이름이에요.">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            disabled={saving}
            placeholder="역할 패널"
          />
        </Field>

        <Field
          label="패널 제목"
          description="디스코드에 게시될 패널 제목이에요."
        >
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            disabled={saving}
            placeholder="역할 패널"
          />
        </Field>
      </div>

      <Field
        label="받는 방식"
        description={`버튼은 최대 ${ROLE_PANEL_MAX_BUTTONS}개, 반응은 이모지가 필수이고 최대 ${ROLE_PANEL_MAX_REACTIONS}개예요. 저장하면 게시된 패널에도 바로 반영돼요.`}
      >
        <Select
          value={mode}
          onValueChange={(value) => value && setMode(value as RolePanelMode)}
          disabled={saving}
        >
          <SelectTrigger className="w-full">
            <SelectValue>
              {(value: RolePanelMode) => MODE_LABELS[value] ?? value}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(MODE_LABELS) as RolePanelMode[]).map((value) => (
              <SelectItem key={value} value={value}>
                {MODE_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="안내 문구" description="패널에 들어갈 안내 메시지예요.">
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={1000}
          disabled={saving}
          rows={2}
          placeholder="아래 버튼을 눌러 원하는 역할을 받거나 해제하세요."
        />
      </Field>

      <Field
        label="패널 이미지"
        description="패널 안내 문구 아래에 함께 보여줄 이미지예요. (선택, PNG·JPEG·WebP·GIF 최대 8MB)"
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept={ASSET_ALLOWED_MIME.join(",")}
              className="sr-only"
              onChange={(event) => {
                void handleImageUpload(event.target.files?.[0] ?? null);
                event.target.value = "";
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={saving || uploadingImage}
            >
              {uploadingImage ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Upload size={14} />
              )}
              {uploadingImage ? "업로드 중…" : "이미지 업로드"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAssetPickerOpen(true)}
              disabled={saving || uploadingImage}
            >
              <Images size={14} /> 에셋 보관함
            </Button>
            {imageUrl ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setImageUrl(null)}
                disabled={saving || uploadingImage}
              >
                <X size={14} /> 이미지 제거
              </Button>
            ) : null}
          </div>

          {imageUrl ? (
            <div className="overflow-hidden rounded-control border border-border-subtle bg-surface-2 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt="패널 이미지 미리보기"
                className="max-h-48 w-full rounded-sm object-contain"
              />
            </div>
          ) : null}
        </div>
        <AssetPicker
          guildId={guildId}
          open={assetPickerOpen}
          onClose={() => setAssetPickerOpen(false)}
          onSelect={(urls) => {
            if (urls[0]) setImageUrl(urls[0]);
          }}
        />
      </Field>

      <Field
        label={`역할 ${mode === "reaction" ? "반응" : "버튼"} (${buttons.length}/${maxItems})`}
        description={
          mode === "reaction"
            ? "이모지를 누르면 해당 역할이 부여되고, 반응을 취소하면 해제돼요. 이모지는 필수예요."
            : "버튼을 누르면 해당 역할이 부여/해제돼요. 디스코드 메시지 컨테이너 안에 함께 표시돼요."
        }
      >
        {rolesError ? (
          <ChannelListError error={rolesError} onRetry={reloadRoles} />
        ) : (
          <div className="space-y-3 rounded-menu bg-surface-2 p-3">
            {buttons.length === 0 ? (
              <p className="py-2 text-center text-xs text-muted-foreground">
                아직 추가된 역할이 없어요. 아래 역할 추가 버튼을 눌러 시작해 보세요.
              </p>
            ) : (
              <div className="space-y-2">
                {buttons.map((button) => (
                  <div
                    key={button.id}
                    className="flex flex-wrap items-center gap-2 rounded-control bg-surface-1 p-2 sm:flex-nowrap"
                  >
                    <div className="min-w-[10rem] flex-1">
                      <RoleSelect
                        roles={roles}
                        value={button.roleId || ""}
                        onChange={(roleId) => {
                          const matchedRole = roles?.find(
                            (r) => r.id === roleId,
                          );
                          updateButton(button.id, {
                            roleId,
                            ...(!button.label.trim() && matchedRole
                              ? { label: matchedRole.name }
                              : {}),
                          });
                        }}
                        disabled={saving}
                        placeholder="역할을 선택해 주세요"
                      />
                    </div>

                    <EmojiPicker
                      value={button.emoji}
                      onChange={(emoji) => updateButton(button.id, { emoji })}
                      required={mode === "reaction"}
                      disabled={saving}
                      placeholder="이모지"
                    />

                    <Input
                      value={button.label}
                      onChange={(e) =>
                        updateButton(button.id, { label: e.target.value })
                      }
                      maxLength={80}
                      disabled={saving}
                      placeholder="버튼 라벨"
                      aria-label="버튼 라벨"
                      className="w-32 shrink-0"
                    />

                    {mode === "button" ? (
                      <Select
                        value={button.style}
                        onValueChange={(value) =>
                          value &&
                          updateButton(button.id, {
                            style: value as RolePanelButton["style"],
                          })
                        }
                        disabled={saving}
                      >
                        <SelectTrigger
                          className="w-36 shrink-0"
                          aria-label="버튼 색상"
                        >
                          <SelectValue>
                            {(value: RolePanelButton["style"]) => {
                              const meta =
                                BUTTON_STYLE_META[value] ??
                                BUTTON_STYLE_META.secondary;
                              return (
                                <span className="flex items-center gap-2">
                                  <span
                                    className={cn(
                                      "size-2.5 shrink-0 rounded-full",
                                    meta.dotClass,
                                    )}
                                    aria-hidden
                                  />
                                  <span className="truncate">{meta.label}</span>
                                </span>
                              );
                            }}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {BUTTON_STYLES.map((style) => {
                            const meta = BUTTON_STYLE_META[style];
                            return (
                              <SelectItem key={style} value={style}>
                                <span className="flex items-center gap-2">
                                  <span
                                    className={cn(
                                      "size-2.5 shrink-0 rounded-full",
                                      meta.dotClass,
                                    )}
                                    aria-hidden
                                  />
                                  <span>{meta.label}</span>
                                </span>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    ) : null}

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeButton(button.id)}
                      disabled={saving}
                      aria-label="버튼 제거"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={addButton}
                disabled={saving || buttons.length >= maxItems}
              >
                <Plus size={14} /> 역할 추가
              </Button>
              <span className="text-xs text-muted-foreground">
                최대 {maxItems}개
              </span>
            </div>

            {buttons.length > 0 || imageUrl ? (
              <div className="space-y-2 border-t border-border/50 pt-3">
                <span className="text-xs font-medium text-muted-foreground">
                  디스코드 컨테이너 미리보기
                </span>
                <div className="space-y-2.5 rounded-control border-l-4 border-[#5865F2] bg-surface-1 p-3">
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-foreground">
                      {title.trim() || "역할 패널"}
                    </p>
                    {description.trim() ? (
                      <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                        {description}
                      </p>
                    ) : null}
                  </div>
                  {imageUrl ? (
                    <div className="overflow-hidden rounded-control bg-surface-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imageUrl}
                        alt="패널 이미지"
                        className="max-h-52 w-full object-cover"
                      />
                    </div>
                  ) : null}
                  {buttons.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {buttons.map((button) => {
                        const roleName =
                          roles?.find((r) => r.id === button.roleId)?.name ??
                          "역할 미선택";
                        const labelText = button.label.trim() || roleName;
                        const styleMeta =
                          BUTTON_STYLE_META[button.style] ??
                          BUTTON_STYLE_META.secondary;

                        if (mode === "reaction") {
                          return (
                            <span
                              key={button.id}
                              className="inline-flex items-center gap-1.5 rounded-control bg-surface-2 px-2 py-1 text-xs text-foreground"
                            >
                              <span className="text-sm leading-none">
                                {button.emoji || "❔"}
                              </span>
                              <span className="text-muted-foreground">
                                {labelText}
                              </span>
                            </span>
                          );
                        }

                        return (
                          <span
                            key={button.id}
                            className={cn(
                              "inline-flex h-8 items-center gap-1.5 rounded-control px-3 text-xs font-medium",
                              styleMeta.previewClass,
                            )}
                          >
                            {button.emoji ? (
                              <span className="text-sm leading-none">
                                {button.emoji}
                              </span>
                            ) : null}
                            <span>{labelText}</span>
                          </span>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </Field>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || busy}>
          {saving ? "저장 중..." : "저장"}
        </Button>
      </div>
    </Card>
  );
}
