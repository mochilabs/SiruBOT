"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bot,
  Globe,
  Hash,
  Loader2,
  PowerOff,
  Trash2,
} from "lucide-react";

import { ChannelSelect } from "@/components/discord/channel-select";
import { CHANNEL_TYPE_GROUP } from "@/components/discord/discord-options";
import { Field } from "@/components/primitives/field";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useConfirmDelete } from "@/hooks/use-confirm-delete";
import { useGuildChannels } from "@/hooks/use-guild-settings";
import { ApiError, toApiError, toError } from "@/lib/api-error";
import { notifyApiError, notifySaved } from "@/lib/notify";
import type { AiMode, AiPolicy } from "@/types/settings";

import {
  ChannelListError,
  InfoBox,
  type ModeCardOption,
  ModePicker,
  PanelError,
  PanelHeader,
  PanelLoading,
  SaveBar,
  WarningBox,
} from "./settings-shared";

// 모드 카드 데이터(라벨·설명·아이콘)만 여기 두고 마크업은 settings-shared의 ModePicker를 써요
const MODE_CARDS: ModeCardOption<AiMode>[] = [
  {
    value: "all",
    label: "모든 채널",
    description: "멘션하면 어떤 텍스트 채널에서든 답해요. (@everyone 제외)",
    icon: <Globe size={16} />,
  },
  {
    value: "channels",
    label: "특정 채널",
    description: "아래에서 선택한 채널에서만 답해요.",
    icon: <Hash size={16} />,
  },
  {
    value: "off",
    label: "끄기",
    description: "이 서버에서는 AI 채팅을 사용하지 않아요.",
    icon: <PowerOff size={16} />,
  },
];

function AiSettingsPanel({ guildId }: { guildId: string }) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [policy, setPolicy] = useState<AiPolicy | null>(null);
  const [mode, setMode] = useState<AiMode>("all");
  const [channelIds, setChannelIds] = useState<string[]>([]);
  const { armedId: confirmTarget, request: requestDelete } = useConfirmDelete();
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const confirmDelete = confirmTarget === "history";

  // 특정 채널 모드가 활성일 때만 채널 목록을 요청해요
  const {
    channels,
    error: channelsError,
    reload: reloadChannels,
  } = useGuildChannels(guildId, mode === "channels");

  const applyPolicy = useCallback((next: AiPolicy) => {
    setPolicy(next);
    setMode(next.mode);
    setChannelIds(next.channelIds);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    (async () => {
      try {
        const res = await fetch(`/api/servers/${guildId}/ai`, {
          cache: "no-store",
        });
        if (!res.ok)
          throw await toApiError(res, "AI 설정을 불러오지 못했어요.");
        const data: AiPolicy = await res.json();
        if (!cancelled) applyPolicy(data);
      } catch (error) {
        if (!cancelled)
          setLoadError(toError(error, "AI 설정을 불러오지 못했어요."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [guildId, applyPolicy, retryToken]);

  const dirty =
    policy !== null &&
    (mode !== policy.mode ||
      JSON.stringify(channelIds) !== JSON.stringify(policy.channelIds));

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/servers/${guildId}/ai`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          channelIds,
        }),
      });
      if (!res.ok) throw await toApiError(res, "저장에 실패했어요.");
      applyPolicy((await res.json()) as AiPolicy);
      notifySaved("AI 설정을 저장했어요.");
    } catch (error) {
      notifyApiError(error, "저장에 실패했어요.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteHistory = async () => {
    // 첫 클릭은 무장(4초 자동 해제), 두 번째 클릭이 실제 삭제예요
    if (!requestDelete("history")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/servers/${guildId}/ai/history`, {
        method: "DELETE",
      });
      if (!res.ok) throw await toApiError(res, "기록 삭제에 실패했어요.");
      setPolicy((prev) => (prev ? { ...prev, historyCount: 0 } : prev));
      toast.success("이 서버의 AI 대화 기록을 삭제했어요.");
    } catch (error) {
      notifyApiError(error, "기록 삭제에 실패했어요.");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <PanelLoading label="AI 설정 불러오는 중…" />;
  if (loadError)
    return (
      <PanelError
        error={loadError}
        onRetry={() => {
          setLoading(true);
          setRetryToken((t) => t + 1);
        }}
      />
    );

  return (
    <Card padding="lg" className="gap-6 overflow-visible">
      <PanelHeader
        icon={<Bot className="h-5 w-5" />}
        title="AI 채팅 설정"
        description="응답할 채널 범위와 지침을 관리해요."
        action={
          <Button
            variant="icon"
            size="sm"
            aria-label="설정 새로고침"
            disabled={dirty || saving}
            icon={
              <Loader2 size={16} className={loading ? "animate-spin" : ""} />
            }
            onClick={() => {
              setLoading(true);
              setRetryToken((t) => t + 1);
            }}
          />
        }
      />

      {/* 모드 선택 */}
      <ModePicker
        label="AI 채팅 모드"
        value={mode}
        options={MODE_CARDS}
        disabled={saving}
        onChange={setMode}
      />

      {/* 특정 채널 선택 */}
      {mode === "channels" && (
        <div className="space-y-3">
          <Field
            label="허용 채널"
            description="선택한 텍스트 채널에서만 AI가 답해요. 여러 개를 고를 수 있어요."
          >
            <ChannelSelect
              multiple
              channels={channels}
              types={CHANNEL_TYPE_GROUP.chat}
              searchPlaceholder="채널 검색…"
              placeholder="채널을 선택해 주세요"
              value={channelIds}
              onChange={setChannelIds}
              disabled={saving}
            />
          </Field>
          {channelsError && <ChannelListError error={channelsError} onRetry={reloadChannels} />}
          {!channelsError && channelIds.length === 0 && (
            <WarningBox>
              허용 채널이 0개면 어디서도 응답하지 않아요. 채널을 최소 1개 선택해
              주세요.
            </WarningBox>
          )}
        </div>
      )}

      <InfoBox>
        <p>
          디스코드에서{" "}
          <span className="font-semibold text-foreground">/채팅설정</span>{" "}
          커맨드로도 바꿀 수 있어요.
        </p>
        <p>
          저장된 대화 기록:{" "}
          <span className="font-semibold text-foreground">
            {policy?.historyCount ?? 0}
          </span>
          개 채널 · 허용 채널{" "}
          <span className="font-semibold text-foreground">
            {channelIds.length}
          </span>
          개
        </p>
      </InfoBox>

        <Button
          variant="danger"
          loading={deleting}
          disabled={(policy?.historyCount ?? 0) === 0}
          icon={deleting ? undefined : <Trash2 size={16} />}
          onClick={handleDeleteHistory}
          className={confirmDelete ? "ring-2 ring-destructive/50" : ""}
        >
          {confirmDelete ? "정말 삭제할까요?" : "대화 기록 전체 삭제"}
        </Button>
      <SaveBar dirty={dirty} saving={saving} onSave={handleSave} />
    </Card>
  );
}

export function AiSettings({ guildId }: { guildId: string }) {
  return <AiSettingsPanel guildId={guildId} />;
}
