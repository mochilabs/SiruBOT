"use client";

import { useCallback, useState } from "react";
import type { RolePanelButton } from "@sirubot/utils/rolePanel";
import {
  isValidRolePanelEmoji,
  ROLE_PANEL_MAX_BUTTONS,
  ROLE_PANEL_MAX_REACTIONS,
  type RolePanelMode,
  validateReactionButtons,
} from "@sirubot/utils/rolePanel";
import { Plus, Send, ShieldCheck, Trash2 } from "lucide-react";
import useSWR from "swr";

import { ChannelSelect } from "@/components/discord/channel-select";
import { CHANNEL_TYPE_GROUP } from "@/components/discord/discord-options";
import { RoleSelect } from "@/components/discord/role-select";
import { Field } from "@/components/primitives/field";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useGuildChannels, useGuildRoles } from "@/hooks/use-guild-settings";
import { toApiError, toError } from "@/lib/api-error";
import { notifyApiError, notifySaved } from "@/lib/notify";
import { createApiFetcher } from "@/lib/swr";

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
        <Card padding="lg" className="text-sm text-muted-foreground">
          아직 역할 패널이 없어요. 새 패널을 만들어 보세요.
        </Card>
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

  const addButton = () => {
    if (buttons.length >= ROLE_PANEL_MAX_BUTTONS) return;
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
        <div className="min-w-0">
          <h3 className="font-bold text-foreground">{panel.name}</h3>
          <p className="text-xs text-muted-foreground">
            총 {panel.clickCount}회 클릭
            {panel.channelId ? " · 게시됨" : " · 미게시"}
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

      <Field label="패널 이름" description="목록에서 식별할 이름이에요.">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          disabled={saving}
          placeholder="역할 패널"
        />
      </Field>

      <Field label="패널 제목" description="디스코드에 게시될 패널 제목이에요.">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          disabled={saving}
          placeholder="역할 패널"
        />
      </Field>

      <Field
        label="받는 방식"
        description={`버튼은 최대 ${ROLE_PANEL_MAX_BUTTONS}개, 반응은 이모지가 필수이고 최대 ${ROLE_PANEL_MAX_REACTIONS}개예요. 저장하면 게시된 패널에도 바로 반영돼요.`}
      >
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as RolePanelMode)}
          disabled={saving}
          className="h-9 w-full rounded-control border bg-background px-2 text-sm"
        >
          {(Object.keys(MODE_LABELS) as RolePanelMode[]).map((value) => (
            <option key={value} value={value}>
              {MODE_LABELS[value]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="안내 문구" description="패널에 들어갈 안내 메시지예요.">
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={1000}
          disabled={saving}
          placeholder="아래 버튼을 눌러 원하는 역할을 받거나 해제하세요."
        />
      </Field>

      <Field
        label={`역할 ${mode === "reaction" ? "반응" : "버튼"} (${buttons.length}/${mode === "reaction" ? ROLE_PANEL_MAX_REACTIONS : ROLE_PANEL_MAX_BUTTONS})`}
        description={
          mode === "reaction"
            ? "이모지를 누르면 해당 역할이 부여되고, 반응을 취소하면 해제돼요. 이모지는 필수예요."
            : "버튼을 누르면 해당 역할이 부여/해제돼요."
        }
      >
        {rolesError ? (
          <ChannelListError error={rolesError} onRetry={reloadRoles} />
        ) : (
          <div className="space-y-2">
            {buttons.map((button) => (
              <div key={button.id} className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <RoleSelect
                    roles={roles}
                    value={button.roleId || ""}
                    onChange={(roleId) => updateButton(button.id, { roleId })}
                    disabled={saving}
                    placeholder="역할을 선택해 주세요"
                  />
                </div>
                <Input
                  value={button.emoji ?? ""}
                  onChange={(e) =>
                    updateButton(button.id, {
                      emoji: e.target.value.trim() || null,
                    })
                  }
                  maxLength={100}
                  disabled={saving}
                  placeholder={mode === "reaction" ? "이모지*" : "이모지"}
                  aria-label="이모지"
                  className="w-20"
                />
                <Input
                  value={button.label}
                  onChange={(e) =>
                    updateButton(button.id, { label: e.target.value })
                  }
                  maxLength={80}
                  disabled={saving}
                  placeholder="라벨"
                  className="w-28"
                />
                {mode === "button" && (
                  <select
                    value={button.style}
                    onChange={(e) =>
                      updateButton(button.id, {
                        style: e.target.value as RolePanelButton["style"],
                      })
                    }
                    disabled={saving}
                    className="h-9 rounded-control border bg-background px-2 text-sm"
                  >
                    {BUTTON_STYLES.map((style) => (
                      <option key={style} value={style}>
                        {style}
                      </option>
                    ))}
                  </select>
                )}
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
            <Button
              variant="outline"
              size="sm"
              onClick={addButton}
              disabled={
                saving ||
                buttons.length >=
                  (mode === "reaction"
                    ? ROLE_PANEL_MAX_REACTIONS
                    : ROLE_PANEL_MAX_BUTTONS)
              }
            >
              <Plus size={14} /> 역할 추가
            </Button>
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
