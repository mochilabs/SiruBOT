"use client";

import { useCallback, useId, useState } from "react";
import {
  isValidRolePanelEmoji,
  ROLE_PANEL_MAX_BUTTONS,
  ROLE_PANEL_MAX_REACTIONS,
  type RolePanelButton,
  type RolePanelImageLayout,
  type RolePanelImagePosition,
  type RolePanelMode,
  validateReactionButtons,
} from "@sirubot/utils/rolePanel";
import { ChevronDown, Plus, Send, ShieldCheck, Trash2 } from "lucide-react";
import useSWR from "swr";

import { ChannelSelect } from "@/components/discord/channel-select";
import { CHANNEL_TYPE_GROUP } from "@/components/discord/discord-options";
import { ConfirmDeleteModal } from "@/components/playlists/confirm-delete-modal";
import { EmptyState } from "@/components/primitives/empty-state";
import { Field } from "@/components/primitives/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useGuildChannels, useGuildRoles } from "@/hooks/use-guild-settings";
import { toApiError, toError } from "@/lib/api-error";
import { notifyApiError, notifySaved } from "@/lib/notify";
import { createApiFetcher } from "@/lib/swr";
import { cn } from "@/lib/utils";

import { RolePanelButtonList } from "./role-panels/role-panel-button-list";
import { RolePanelImageField } from "./role-panels/role-panel-image-field";
import { MODE_LABELS, type RolePanelWithButtons } from "./role-panels/role-panel-meta";
import { RolePanelPreview } from "./role-panels/role-panel-preview";
import {
  ChannelListError,
  InfoBox,
  PanelError,
  PanelHeader,
  PanelLoading,
  SaveBar,
} from "./settings-shared";

const listFetcher = createApiFetcher<RolePanelWithButtons[]>(
  "역할 패널 목록을 불러오지 못했어요.",
  { sessionRetry: true },
);

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
  const url = `/api/servers/${guildId}/role-panels/${panel.id}`;
  const [name, setName] = useState(panel.name);
  const [title, setTitle] = useState(panel.title);
  const [description, setDescription] = useState(panel.description);
  const [imageUrl, setImageUrl] = useState<string | null>(
    panel.imageUrl ?? null,
  );
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

  const handleSave = async () => {
    setSaving(true);
    try {
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

      <RolePanelImageField
        guildId={guildId}
        saving={saving}
        imageUrl={imageUrl}
        onImageUrlChange={setImageUrl}
        imageLayout={imageLayout}
        onImageLayoutChange={setImageLayout}
        imagePosition={imagePosition}
        onImagePositionChange={setImagePosition}
        accentColor={accentColor}
        onAccentColorChange={setAccentColor}
      />

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
          <RolePanelButtonList
            buttons={buttons}
            onButtonsChange={setButtons}
            roles={roles}
            mode={mode}
            maxItems={maxItems}
            saving={saving}
          />
        )}
      </Field>

      <Field
        label="디스코드 미리보기"
        description="게시했을 때 메시지가 이렇게 보여요."
      >
        <RolePanelPreview
          title={title}
          description={description}
          imageUrl={imageUrl}
          imageLayout={imageLayout}
          imagePosition={imagePosition}
          accentColor={accentColor}
          mode={mode}
          buttons={buttons}
          roles={roles}
        />
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
