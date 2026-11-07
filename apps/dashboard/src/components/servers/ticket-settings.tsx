"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TicketConfig, TicketConfigPatch } from "@sirubot/utils/ticket";
import { TICKET_CONFIG_DEFAULTS } from "@sirubot/utils/ticket";
import { Send, Ticket as TicketIcon } from "lucide-react";
import useSWR from "swr";

import { ChannelSelect } from "@/components/discord/channel-select";
import { CHANNEL_TYPE_GROUP } from "@/components/discord/discord-options";
import { RoleSelect } from "@/components/discord/role-select";
import { Field } from "@/components/primitives/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useGuildChannels, useGuildRoles } from "@/hooks/use-guild-settings";
import { toApiError, toError } from "@/lib/api-error";
import { notifyApiError, notifySaved } from "@/lib/notify";
import { createApiFetcher } from "@/lib/swr";

import { SettingsPanel } from "./settings-panel";
import { SettingsSection } from "./settings-section";
import { ChannelListError, InfoBox } from "./settings-shared";
import { TicketManagePanel } from "./ticket-manage-panel";

const ticketFetcher = createApiFetcher<TicketConfig>(
  "티켓 설정을 불러오지 못했어요.",
  { sessionRetry: true },
);

export function TicketSettings({ guildId }: { guildId: string }) {
  const url = `/api/servers/${guildId}/ticket`;
  const { data, error, isLoading, mutate } = useSWR<TicketConfig>(
    url,
    ticketFetcher,
  );

  const {
    channels,
    error: channelsError,
    reload: reloadChannels,
  } = useGuildChannels(guildId, true);
  const {
    roles,
    error: rolesError,
    reload: reloadRoles,
  } = useGuildRoles(guildId, true);

  const [form, setForm] = useState<TicketConfig>(TICKET_CONFIG_DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (data && !dirtyRef.current) {
      setForm(data);
    }
  }, [data]);

  const patch = useCallback((partial: TicketConfigPatch) => {
    dirtyRef.current = true;
    setForm((prev) => ({ ...prev, ...partial }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const payload = { ...form } as Record<string, unknown>;
      delete payload.guildId;
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw await toApiError(res, "티켓 설정을 저장하지 못했어요.");
      }
      const updated = (await res.json()) as TicketConfig;
      dirtyRef.current = false;
      await mutate(updated, { revalidate: false });
      notifySaved("티켓 설정을 저장했어요.");
    } catch (err) {
      notifyApiError(err, "저장에 실패했어요.");
    } finally {
      setSaving(false);
    }
  }, [url, form, mutate]);

  const handlePost = useCallback(async () => {
    setPosting(true);
    try {
      const res = await fetch(`/api/servers/${guildId}/ticket/post`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          form.panelChannelId ? { channelId: form.panelChannelId } : {},
        ),
      });
      if (!res.ok) throw await toApiError(res, "티켓 패널을 게시하지 못했어요.");
      await mutate();
      notifySaved("티켓 패널을 게시했어요.");
    } catch (err) {
      notifyApiError(err, "게시에 실패했어요.");
    } finally {
      setPosting(false);
    }
  }, [guildId, form.panelChannelId, mutate]);

  const panel = {
    form: isLoading ? null : form,
    isLoading,
    error: error ? toError(error, "티켓 설정을 불러오지 못했어요.") : null,
    dirty: dirtyRef.current,
    saving,
    handleSave,
    reload: () => void mutate(),
  };

  return (
    <SettingsPanel
      panel={panel}
      icon={<TicketIcon size={20} />}
      title="티켓 시스템"
      description="유저가 비공개 상담 채널을 열어 관리자/스태프와 1:1로 소통할 수 있는 기능이에요."
    >
      {() => (
        <>
        <SettingsSection title="기본" summary={form.enabled ? "켬" : "끔"} defaultOpen>
        <Field
          label="티켓 기능 활성화"
          description="티켓 생성 패널과 오픈 버튼 동작을 활성화해요."
        >
          <div className="flex items-center gap-3">
            <Switch
              checked={form.enabled}
              onChange={(checked) => patch({ enabled: checked })}
              disabled={saving}
              label="기능 켜기"
              labelPosition="left"
            />
          </div>
        </Field>

        <InfoBox>
          설정을 저장한 뒤, 디스코드에서 <code>/티켓 패널</code> 명령어를 입력하면
          유저가 누를 수 있는 티켓 오픈 패널 메시지를 원하는 채널에 보낼 수 있어요.
        </InfoBox>

        <Field
          label="티켓 생성 카테고리"
          description="유저가 티켓을 열었을 때 채널이 생성될 카테고리를 선택해요."
        >
          {channelsError ? (
            <ChannelListError error={channelsError} onRetry={reloadChannels} />
          ) : (
            <ChannelSelect
              channels={channels}
              value={form.categoryId ?? ""}
              onChange={(val) => patch({ categoryId: val || null })}
              types={CHANNEL_TYPE_GROUP.category}
              groupByCategory={false}
              noneLabel="카테고리 없음 (최상단 생성)"
              disabled={saving || !form.enabled}
              placeholder="카테고리를 선택해 주세요"
            />
          )}
        </Field>

        <Field
          label="담당자 역할 (Support Roles)"
          description="티켓 채널을 열람하고 관리할 수 있는 스태프 역할을 선택해요. (서버 관리자는 역할과 무관하게 자동 포함)"
        >
          {rolesError ? (
            <ChannelListError error={rolesError} onRetry={reloadRoles} />
          ) : (
            <RoleSelect
              roles={roles}
              multiple
              value={form.supportRoleIds}
              onChange={(vals) => patch({ supportRoleIds: vals })}
              disabled={saving || !form.enabled}
              placeholder="담당자 역할을 선택해 주세요"
            />
          )}
        </Field>

        <Field
          label="로그 채널"
          description="티켓이 종료될 때 마감 사유와 요약 내역을 남길 채널을 선택해요."
        >
          {channelsError ? (
            <ChannelListError error={channelsError} onRetry={reloadChannels} />
          ) : (
            <ChannelSelect
              channels={channels}
              value={form.logChannelId ?? ""}
              onChange={(val) => patch({ logChannelId: val || null })}
              types={CHANNEL_TYPE_GROUP.chat}
              noneLabel="로그 남기지 않음"
              disabled={saving || !form.enabled}
              placeholder="로그 채널을 선택해 주세요"
            />
          )}
        </Field>

        </SettingsSection>

        <SettingsSection title="제한" summary={`유저당 ${form.maxOpenPerUser}개`}>
        <Field
          label="유저당 동시 오픈 티켓 수"
          description="유저 한 명이 동시에 열어둘 수 있는 최대 티켓 개수예요 (도배 방지)."
        >
          <Slider hideLabel
            value={form.maxOpenPerUser}
            onChange={(val) => patch({ maxOpenPerUser: val })}
            min={1}
            max={5}
            step={1}
            formatValue={(v) => `${v}개`}
            disabled={saving || !form.enabled}
          />
        </Field>

        </SettingsSection>

        <SettingsSection title="패널 문구" summary={form.panelTitle || undefined}>
        <Field
          label="패널 제목"
          description="디스코드 채널에 게시될 티켓 오픈 패널의 제목이에요."
        >
          <Input
            value={form.panelTitle}
            onChange={(e) => patch({ panelTitle: e.target.value })}
            maxLength={100}
            disabled={saving || !form.enabled}
            placeholder="고객지원 티켓"
          />
        </Field>

        <Field
          label="패널 안내 문구"
          description="패널 임베드에 들어갈 상세 안내 메시지예요."
        >
          <Input
            value={form.panelDescription}
            onChange={(e) => patch({ panelDescription: e.target.value })}
            maxLength={1000}
            disabled={saving || !form.enabled}
            placeholder="아래 버튼을 눌러 담당자와 1:1 비공개 상담 채널을 개설해요."
          />
        </Field>
        </SettingsSection>

          <SettingsSection title="패널 게시" summary={form.panelChannelId ? "채널 지정됨" : "채널 미지정"}>
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 text-xs text-muted-foreground sm:text-sm">
                선택한 채널에 티켓 오픈 패널을 게시해요. 이미 게시된 패널이 있으면 이전 메시지는 지워져요.
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={handlePost}
                disabled={posting || !form.enabled || !form.panelChannelId}
              >
                <Send size={14} /> {posting ? "게시 중..." : "게시"}
              </Button>
            </div>
            {channelsError ? (
              <ChannelListError error={channelsError} onRetry={reloadChannels} />
            ) : (
              <ChannelSelect
                channels={channels}
                value={form.panelChannelId ?? ""}
                onChange={(val) => patch({ panelChannelId: val || null })}
                types={CHANNEL_TYPE_GROUP.chat}
                noneLabel="채널 선택 안 함"
                disabled={saving || posting || !form.enabled}
                placeholder="패널을 게시할 채널을 선택해 주세요"
              />
            )}
          </SettingsSection>

          <SettingsSection title="티켓 목록">
            <TicketManagePanel guildId={guildId} />
          </SettingsSection>
        </>
      )}
    </SettingsPanel>
  );
}
