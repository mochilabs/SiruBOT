"use client";

import { useCallback, useId, useRef, useState } from "react";
import type { RolePanelButton } from "@sirubot/utils/rolePanel";
import {
  isValidRolePanelEmoji,
  ROLE_PANEL_MAX_BUTTONS,
  ROLE_PANEL_MAX_REACTIONS,
  type RolePanelImageLayout,
  type RolePanelImagePosition,
  type RolePanelMode,
  validateReactionButtons,
} from "@sirubot/utils/rolePanel";
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
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
import { ConfirmDeleteModal } from "@/components/playlists/confirm-delete-modal";
import { EmptyState } from "@/components/primitives/empty-state";
import { Field } from "@/components/primitives/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { COLOR_PRESETS, ColorPicker } from "@/components/ui/color-picker";
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
  SaveBar,
} from "./settings-shared";

interface RolePanelWithButtons {
  id: string;
  guildId: string;
  name: string;
  title: string;
  description: string;
  imageUrl: string | null;
  imageLayout: RolePanelImageLayout;
  imagePosition: RolePanelImagePosition;
  accentColor: string | null;
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

const IMAGE_LAYOUT_LABELS: Record<RolePanelImageLayout, string> = {
  gallery: "미디어 갤러리 (큰 이미지)",
  thumbnail: "섬네일 (제목·안내문 옆)",
};

const IMAGE_POSITION_LABELS: Record<RolePanelImagePosition, string> = {
  top: "제목 위",
  middle: "안내문 아래",
  bottom: "버튼 아래",
};

/** 봇 기본 강조색 — packages/utils DEFAULT_COLOR_HEX와 같은 값이에요 (멤버 인사 탭도 같은 리터럴을 써요). */
const DEFAULT_ACCENT_COLOR_HEX = "#ffdaff";

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
  // 펼친 패널 — 아직 건드리지 않았으면(null) 첫 패널만 펼쳐요
  const [expandedIds, setExpandedIds] = useState<Set<string> | null>(null);

  const handleCreate = useCallback(async () => {
    setBusyId("__create__");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `역할 패널 ${(data?.length ?? 0) + 1}` }),
      });
      if (!res.ok) throw await toApiError(res, "역할 패널을 만들지 못했어요.");
      const next = await mutate();
      const created = next?.[next.length - 1];
      if (created) {
        setExpandedIds((prev) => new Set(prev ?? (next?.[0] ? [next[0].id] : [])).add(created.id));
      }
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
    <Card padding="lg" className="gap-6 overflow-visible">
      <PanelHeader
        icon={<ShieldCheck size={20} />}
        title="역할 패널"
        description="유저가 버튼을 눌러 스스로 역할을 받거나 해제할 수 있는 패널이에요. 여러 개를 만들 수 있어요."
        action={
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={16} />}
            onClick={handleCreate}
            disabled={busyId === "__create__"}
          >
            새 패널
          </Button>
        }
      />

      {panels.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="아직 역할 패널이 없어요"
          description="새 패널을 만들어 유저가 스스로 역할을 받거나 해제할 수 있게 해보세요."
          action={
            <Button
              variant="primary"
              icon={<Plus size={16} />}
              onClick={handleCreate}
              disabled={busyId === "__create__"}
            >
              새 패널
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {panels.map((panel, index) => (
            <li key={panel.id}>
              <RolePanelCard
                open={expandedIds ? expandedIds.has(panel.id) : index === 0}
                onToggle={() =>
                  setExpandedIds((prev) => {
                    const base = new Set(prev ?? (panels[0] ? [panels[0].id] : []));
                    if (base.has(panel.id)) base.delete(panel.id);
                    else base.add(panel.id);
                    return base;
                  })
                }
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
            </li>
          ))}
        </ul>
      )}

      <InfoBox>
        패널을 만들고 역할 버튼을 추가한 뒤 저장하세요. 게시는 패널 아래의{" "}
        <code>게시</code> 버튼 또는 디스코드 <code>/역할패널 게시</code>{" "}
        명령어로 할 수 있어요. 이미 게시된 패널은 저장하면 메시지에 바로
        반영돼요.
      </InfoBox>
    </Card>
  );
}

function RolePanelCard({
  open,
  onToggle,
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
  open: boolean;
  onToggle: () => void;
  guildId: string;
  panel: RolePanelWithButtons;
  roles: ReturnType<typeof useGuildRoles>["roles"];
  rolesError: ReturnType<typeof useGuildRoles>["error"];
  reloadRoles: () => void;
  busy: boolean;
  onPost: (channelId: string | null) => void;
  onDelete: () => void | Promise<void>;
  onMutate: () => Promise<unknown>;
}) {
  const bodyId = useId();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  // 포인터 높이에 걸린 행 번호 — 목록 위·아래로 벗어나면 맨 앞·맨 뒤로 봐요
  const rowIndexAt = (clientY: number) => {
    const rects = rowRefs.current
      .slice(0, buttons.length)
      .map((node) => node?.getBoundingClientRect());
    const first = rects[0];
    if (!first || clientY < first.top) return 0;
    const found = rects.findIndex((rect) => rect && clientY >= rect.top && clientY <= rect.bottom);
    return found === -1 ? buttons.length - 1 : found;
  };
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
  const [imageLayout, setImageLayout] = useState<RolePanelImageLayout>(
    panel.imageLayout ?? "gallery",
  );
  const [imagePosition, setImagePosition] = useState<RolePanelImagePosition>(
    panel.imagePosition ?? "middle",
  );
  const [accentColor, setAccentColor] = useState<string | null>(
    panel.accentColor ?? null,
  );
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

  const dirty =
    name !== panel.name ||
    title !== panel.title ||
    description !== panel.description ||
    imageUrl !== (panel.imageUrl ?? null) ||
    imageLayout !== (panel.imageLayout ?? "gallery") ||
    imagePosition !== (panel.imagePosition ?? "middle") ||
    accentColor !== (panel.accentColor ?? null) ||
    mode !== (panel.mode ?? "button") ||
    JSON.stringify(buttons) !== JSON.stringify(panel.buttons);

  const handleDiscard = () => {
    setName(panel.name);
    setTitle(panel.title);
    setDescription(panel.description);
    setImageUrl(panel.imageUrl ?? null);
    setImageLayout(panel.imageLayout ?? "gallery");
    setImagePosition(panel.imagePosition ?? "middle");
    setAccentColor(panel.accentColor ?? null);
    setMode(panel.mode ?? "button");
    setButtons(panel.buttons);
  };

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

  const moveButton = (from: number, to: number) => {
    if (from === to || to < 0 || to >= buttons.length) return;
    setButtons((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      if (item) next.splice(to, 0, item);
      return next;
    });
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
        imageLayout,
        imagePosition,
        accentColor,
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
      const updated = (await res.json()) as { buttons?: RolePanelButton[] };
      if (Array.isArray(updated.buttons)) {
        setButtons(updated.buttons);
      }
      await onMutate();
      notifySaved("역할 패널을 저장했어요.");
    } catch (err) {
      notifyApiError(err, "저장에 실패했어요.");
    } finally {
      setSaving(false);
    }
  };

  // 미리보기에서 갤러리 이미지를 놓을 자리 — 섬네일이면 갤러리는 없어요.
  const galleryPosition =
    imageUrl && imageLayout === "gallery" ? imagePosition : null;
  const galleryPreview = imageUrl ? (
    <div className="overflow-hidden rounded-control bg-surface-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt="패널 이미지"
        className="max-h-52 w-full object-cover"
      />
    </div>
  ) : null;

  return (
    <div className="rounded-card bg-surface-2 p-4">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onToggle}
          className="group flex min-w-0 flex-1 items-start gap-3 rounded-control text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDown
            size={16}
            aria-hidden
            className={cn(
              "mt-1 shrink-0 text-muted-foreground transition-transform duration-fast group-hover:text-foreground",
              !open && "-rotate-90",
            )}
          />
          <span className="min-w-0 space-y-1">
            <span className="flex items-center gap-2">
              <span className="truncate font-bold text-foreground">
                {panel.name}
              </span>
              <Badge variant={panel.channelId ? "success" : "secondary"}>
                {panel.channelId ? "게시됨" : "미게시"}
              </Badge>
            </span>
            <span className="block text-xs text-muted-foreground">
              {MODE_LABELS[panel.mode]?.split(" ")[0] ?? "버튼"} {panel.buttons.length}개 · 총{" "}
              {panel.clickCount}회 클릭
            </span>
          </span>
        </button>
      </div>

      <div id={bodyId} hidden={!open} className="space-y-5 pt-5">
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
        label="이미지와 강조색"
        description="이미지는 선택이에요. (PNG·JPEG·WebP·GIF 최대 8MB) 강조색은 메시지 컨테이너 왼쪽 선 색이에요."
      >
        <div className="space-y-4 rounded-card bg-surface-1 p-4">
          <div className="flex flex-wrap items-center gap-3">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt="패널 이미지"
                className="h-14 w-14 shrink-0 rounded-control object-cover"
              />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-control bg-surface-2 text-muted-foreground">
                <Images size={18} aria-hidden />
              </div>
            )}
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
            <div className="flex flex-wrap items-center gap-2">
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
                {uploadingImage ? "업로드 중…" : "업로드"}
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
                  <X size={14} /> 제거
                </Button>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                이미지 표시 방식
              </span>
              <Select
                value={imageLayout}
                onValueChange={(value) =>
                  value && setImageLayout(value as RolePanelImageLayout)
                }
                disabled={saving || !imageUrl}
              >
                <SelectTrigger className="w-full" aria-label="이미지 표시 방식">
                  <SelectValue>
                    {(value: RolePanelImageLayout) =>
                      IMAGE_LAYOUT_LABELS[value] ?? value
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(IMAGE_LAYOUT_LABELS) as RolePanelImageLayout[]).map(
                    (value) => (
                      <SelectItem key={value} value={value}>
                        {IMAGE_LAYOUT_LABELS[value]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                이미지 위치
                {imageLayout === "thumbnail" ? " (섬네일은 고정)" : ""}
              </span>
              <Select
                value={imagePosition}
                onValueChange={(value) =>
                  value && setImagePosition(value as RolePanelImagePosition)
                }
                disabled={saving || !imageUrl || imageLayout === "thumbnail"}
              >
                <SelectTrigger className="w-full" aria-label="이미지 위치">
                  <SelectValue>
                    {(value: RolePanelImagePosition) =>
                      IMAGE_POSITION_LABELS[value] ?? value
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(IMAGE_POSITION_LABELS) as RolePanelImagePosition[]).map(
                    (value) => (
                      <SelectItem key={value} value={value}>
                        {IMAGE_POSITION_LABELS[value]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5 border-t border-border-subtle pt-4">
            <span className="text-xs font-medium text-muted-foreground">
              컨테이너 강조색
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <ColorPicker
                value={accentColor ?? DEFAULT_ACCENT_COLOR_HEX}
                label="강조색"
                disabled={saving}
                presets={[DEFAULT_ACCENT_COLOR_HEX, ...COLOR_PRESETS]}
                onChange={setAccentColor}
              />
              {accentColor !== null && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                  onClick={() => setAccentColor(null)}
                >
                  봇 기본색 사용
                </Button>
              )}
            </div>
          </div>
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
                {buttons.map((button, index) => (
                  <div
                    key={button.id}
                    ref={(node) => {
                      rowRefs.current[index] = node;
                    }}
                    className={cn(
                      "flex flex-wrap items-center gap-2 rounded-control bg-surface-1 p-2 sm:flex-nowrap",
                      dragIndex === index && "opacity-50",
                      overIndex === index &&
                        dragIndex !== null &&
                        dragIndex !== index &&
                        "ring-2 ring-ring",
                    )}
                  >
                    <div className="flex shrink-0 items-center">
                      {/* 마우스·터치 모두 포인터 이벤트로 끌어요 — 키보드는 옆의 위/아래 버튼을 써요 */}
                      <span
                        onPointerDown={(event) => {
                          if (saving || buttons.length < 2) return;
                          event.currentTarget.setPointerCapture(event.pointerId);
                          setDragIndex(index);
                          setOverIndex(index);
                        }}
                        onPointerMove={(event) => {
                          if (dragIndex !== index) return;
                          setOverIndex(rowIndexAt(event.clientY));
                        }}
                        onPointerUp={(event) => {
                          if (dragIndex !== index) return;
                          event.currentTarget.releasePointerCapture(event.pointerId);
                          const target = rowIndexAt(event.clientY);
                          setDragIndex(null);
                          setOverIndex(null);
                          moveButton(index, target);
                        }}
                        onPointerCancel={() => {
                          setDragIndex(null);
                          setOverIndex(null);
                        }}
                        className={cn(
                          "flex size-8 touch-none items-center justify-center rounded-control text-muted-foreground select-none",
                          buttons.length > 1 && !saving
                            ? "cursor-grab hover:bg-surface-2 hover:text-foreground active:cursor-grabbing"
                            : "opacity-40",
                        )}
                        aria-hidden
                      >
                        <GripVertical size={16} />
                      </span>
                      <div className="flex flex-col">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => moveButton(index, index - 1)}
                          disabled={saving || index === 0}
                          aria-label={`${button.label.trim() || "역할"} 위로 이동`}
                        >
                          <ChevronUp size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => moveButton(index, index + 1)}
                          disabled={saving || index === buttons.length - 1}
                          aria-label={`${button.label.trim() || "역할"} 아래로 이동`}
                        >
                          <ChevronDown size={14} />
                        </Button>
                      </div>
                    </div>

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

          </div>
        )}
      </Field>

      <Field
        label="디스코드 미리보기"
        description="게시했을 때 메시지가 이렇게 보여요."
      >
        <div className="rounded-card bg-discord-embed p-4">
      <div
              className="space-y-3 rounded-control border-l-4 bg-surface-1 p-4"
              style={{ borderColor: accentColor ?? DEFAULT_ACCENT_COLOR_HEX }}
            >
        {galleryPosition === "top" ? galleryPreview : null}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-base font-bold text-foreground">
              {title.trim() || "역할 패널"}
            </p>
            {description.trim() ? (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {imageUrl && imageLayout === "thumbnail" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt="패널 섬네일"
              className="h-16 w-16 shrink-0 rounded-control object-cover"
            />
          ) : null}
        </div>
        {galleryPosition === "middle" ? galleryPreview : null}
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
        {galleryPosition === "bottom" ? galleryPreview : null}
      </div>

        </div>
      </Field>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="danger"
          size="sm"
          onClick={() => setConfirmDeleteOpen(true)}
          disabled={busy || saving}
        >
          <Trash2 size={14} /> 삭제
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => onPost(postChannelId || null)}
            title={dirty ? "먼저 변경 사항을 저장한 뒤 게시해 주세요." : undefined}
            disabled={
              busy ||
              saving ||
              dirty ||
              buttons.length === 0 ||
              !(postChannelId || panel.channelId)
            }
          >
            <Send size={14} /> {panel.channelId ? "업데이트" : "게시"}
          </Button>
          <Button onClick={handleSave} disabled={saving || busy}>
            {saving ? "저장 중..." : "저장"}
          </Button>
        </div>
      </div>
      </div>

      <SaveBar dirty={dirty} saving={saving} onSave={handleSave} onDiscard={handleDiscard} />

      <ConfirmDeleteModal
        open={confirmDeleteOpen}
        title="역할 패널 삭제"
        loading={busy}
        onClose={() => {
          if (!busy) setConfirmDeleteOpen(false);
        }}
        onConfirm={async () => {
          await onDelete();
          setConfirmDeleteOpen(false);
        }}
      >
        <strong>{panel.name}</strong> 패널을 삭제할까요? 삭제하면 되돌릴 수 없어요.
        {panel.channelId
          ? " 디스코드에 게시된 메시지는 자동으로 지워지지 않아요."
          : ""}
      </ConfirmDeleteModal>
    </div>
  );
}
