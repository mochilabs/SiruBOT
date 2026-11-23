"use client";

import { useCallback, useMemo, useState } from "react";
import {
  SCHEDULED_MESSAGE_CONTENT_MAX,
  SCHEDULED_MESSAGE_MAX_ACTIVE_LIMIT,
  SCHEDULED_MESSAGE_MIN_INTERVAL_LIMIT,
  SCHEDULED_MESSAGE_REPEAT_LABELS,
  SCHEDULED_MESSAGE_REPEATS,
  type ScheduledMessageRepeat,
  type ScheduledMessageSettings,
} from "@sirubot/utils/scheduledMessage";
import { CalendarClock, Trash2 } from "lucide-react";
import useSWR from "swr";

import { ChannelSelect } from "@/components/discord/channel-select";
import { CHANNEL_TYPE_GROUP } from "@/components/discord/discord-options";
import { ConfirmDialog } from "@/components/primitives/confirm-dialog";
import { EmptyState } from "@/components/primitives/empty-state";
import { Field } from "@/components/primitives/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { useGuildChannels } from "@/hooks/use-guild-settings";
import { toApiError, toError } from "@/lib/api-error";
import { kstNow } from "@/lib/date-time";
import { notifyApiError } from "@/lib/notify";
import type { ScheduledMessageItem } from "@/lib/scheduled-messages";
import { createApiFetcher } from "@/lib/swr";

import { PanelError, PanelHeader, PanelLoading } from "./settings-shared";
import { ChannelListError, InfoBox } from "./settings-shared";

interface ScheduledMessagesPayload {
  items: ScheduledMessageItem[];
  settings: ScheduledMessageSettings;
}

const fetcher = createApiFetcher<ScheduledMessagesPayload>(
  "예약 메시지를 불러오지 못했어요.",
  { sessionRetry: true },
);

const STATUS_BADGE = {
  pending: { label: "대기", variant: "secondary" },
  running: { label: "보내는 중", variant: "info" },
  failed: { label: "실패", variant: "danger" },
} as const;

/** 지금부터 10분 뒤를 "YYYY-MM-DDTHH:mm"(KST)로 — 입력 기본값 */
function defaultRunAt(): string {
  return kstNow(10);
}

function snippet(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function ScheduledMessagesSettings({ guildId }: { guildId: string }) {
  const base = `/api/servers/${guildId}/scheduled-messages`;
  const { data, error, isLoading, mutate } = useSWR<ScheduledMessagesPayload>(base, fetcher);
  const { channels, error: channelsError, reload: reloadChannels } = useGuildChannels(guildId, true);

  const [channelId, setChannelId] = useState("");
  const [content, setContent] = useState("");
  const [runAt, setRunAt] = useState(defaultRunAt);
  const [repeat, setRepeat] = useState<ScheduledMessageRepeat>("none");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [limits, setLimits] = useState<{ maxActive: string; minIntervalMinutes: string } | null>(null);
  const [savingLimits, setSavingLimits] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ScheduledMessageItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const settings = data?.settings;
  const limitForm = useMemo(
    () => limits ?? (settings ? { maxActive: String(settings.maxActive), minIntervalMinutes: String(settings.minIntervalMinutes) } : null),
    [limits, settings],
  );

  const handleCreate = useCallback(async () => {
    setFormError(null);
    if (!channelId) return setFormError("보낼 채널을 선택해 주세요.");
    if (!content.trim()) return setFormError("메시지 내용을 입력해 주세요.");
    setCreating(true);
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId, content, runAt: runAt.replace("T", " "), repeat }),
      });
      if (!res.ok) throw await toApiError(res, "예약하지 못했어요.");
      setContent("");
      setRepeat("none");
      setRunAt(defaultRunAt());
      await mutate();
      toast.success("예약했어요.");
    } catch (err) {
      // 상한·간격 같은 입력 문제는 폼 안에서 바로 읽을 수 있게 보여줘요
      setFormError(toError(err, "예약하지 못했어요.").message);
    } finally {
      setCreating(false);
    }
  }, [base, channelId, content, runAt, repeat, mutate]);

  const handleSaveLimits = useCallback(async () => {
    if (!limitForm) return;
    setSavingLimits(true);
    try {
      const res = await fetch(`${base}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxActive: Number(limitForm.maxActive),
          minIntervalMinutes: Number(limitForm.minIntervalMinutes),
        }),
      });
      if (!res.ok) throw await toApiError(res, "설정을 저장하지 못했어요.");
      setLimits(null);
      await mutate();
      toast.success("상한·간격을 저장했어요.");
    } catch (err) {
      notifyApiError(err, "저장에 실패했어요.");
    } finally {
      setSavingLimits(false);
    }
  }, [base, limitForm, mutate]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`${base}/${deleteTarget.seriesId}`, { method: "DELETE" });
      if (!res.ok) throw await toApiError(res, "예약을 지우지 못했어요.");
      setDeleteTarget(null);
      await mutate();
      toast.success("예약을 지웠어요.");
    } catch (err) {
      notifyApiError(err, "삭제에 실패했어요.");
    } finally {
      setDeleting(false);
    }
  }, [base, deleteTarget, mutate]);

  if (isLoading || (!data && !error)) return <PanelLoading label="예약 메시지 불러오는 중…" />;
  if (error) return <PanelError error={toError(error, "예약 메시지를 불러오지 못했어요.")} onRetry={() => void mutate()} />;
  if (!data || !limitForm) return <PanelLoading label="예약 메시지 불러오는 중…" />;

  return (
    <Card padding="lg" className="gap-6 overflow-visible">
      <PanelHeader
        icon={<CalendarClock className="h-5 w-5" />}
        title="예약 메시지"
        description="정해진 시각에 채널로 메시지를 보내요. 한 번 또는 매일·매주·매월 반복할 수 있어요."
      />

      <section className="space-y-4">
        <h3 className="text-sm font-bold text-foreground">새 예약</h3>
        <Field label="보낼 채널">
          {channelsError ? (
            <ChannelListError error={channelsError} onRetry={reloadChannels} />
          ) : (
            <ChannelSelect
              channels={channels}
              value={channelId}
              onChange={setChannelId}
              types={CHANNEL_TYPE_GROUP.chat}
              disabled={creating}
              placeholder="채널을 선택해 주세요"
            />
          )}
        </Field>
        <Field
          label="메시지"
          description={`@everyone, @here는 쓸 수 없어요. 사용자·역할 멘션은 그대로 보내요. (${content.length}/${SCHEDULED_MESSAGE_CONTENT_MAX})`}
        >
          {({ id }) => (
            <Textarea
              id={id}
              value={content}
              maxLength={SCHEDULED_MESSAGE_CONTENT_MAX}
              onChange={(event) => setContent(event.target.value)}
              disabled={creating}
              rows={4}
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="일시 (한국 시간)" description="지금부터 1분 뒤 ~ 1년 안">
            {({ id, describedBy }) => (
              <DateTimePicker
                id={id}
                aria-describedby={describedBy}
                value={runAt}
                onChange={setRunAt}
                min={kstNow(1)}
                max={kstNow(60 * 24 * 365)}
                disabled={creating}
              />
            )}
          </Field>
          <Field label="반복" description="매주·매월은 위 일시의 요일·날짜를 따라요.">
            <Select
              value={repeat}
              disabled={creating}
              onValueChange={(value) => {
                if ((SCHEDULED_MESSAGE_REPEATS as readonly string[]).includes(value as string)) setRepeat(value as ScheduledMessageRepeat);
              }}
            >
              <SelectTrigger className="w-full" aria-label="반복">
                <SelectValue>{(value) => SCHEDULED_MESSAGE_REPEAT_LABELS[value as ScheduledMessageRepeat] ?? "한 번"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {SCHEDULED_MESSAGE_REPEATS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {SCHEDULED_MESSAGE_REPEAT_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        {formError && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {formError}
          </p>
        )}
        <Button variant="primary" size="md" loading={creating} onClick={() => void handleCreate()}>
          예약하기
        </Button>
      </section>

      <section className="space-y-3 border-t border-border pt-5">
        <h3 className="text-sm font-bold text-foreground">
          예약 목록 <span className="font-medium text-muted-foreground">{data.items.length}/{settings?.maxActive}</span>
        </h3>
        {data.items.length === 0 ? (
          <EmptyState size="sm" icon={CalendarClock} title="예약된 메시지가 없어요" description="위에서 새 예약을 만들어 보세요." />
        ) : (
          <ul className="space-y-2">
            {data.items.map((item) => (
              <li key={item.seriesId} className="flex items-start justify-between gap-3 rounded-control bg-surface-2 p-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Badge size="sm" variant={STATUS_BADGE[item.status].variant}>
                      {STATUS_BADGE[item.status].label}
                    </Badge>
                    <span>{item.runAt}</span>
                    <span>· {item.repeat}</span>
                    <span>· #{channels?.find((c) => c.id === item.channelId)?.name ?? item.channelId}</span>
                  </div>
                  <p className="break-words text-sm text-foreground">{snippet(item.content, 120)}</p>
                  {item.status === "failed" && item.lastError && (
                    <p className="text-xs font-medium text-destructive">이유: {snippet(item.lastError, 160)}</p>
                  )}
                </div>
                <Button variant="icon" size="icon-sm" aria-label="예약 삭제" onClick={() => setDeleteTarget(item)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4 border-t border-border pt-5">
        <h3 className="text-sm font-bold text-foreground">상한·간격</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="활성 예약 상한" description={`서버당 동시에 둘 수 있는 예약 수 (1~${SCHEDULED_MESSAGE_MAX_ACTIVE_LIMIT}, 기본 25)`}>
            {({ id }) => (
              <Input
                id={id}
                type="number"
                min={1}
                max={SCHEDULED_MESSAGE_MAX_ACTIVE_LIMIT}
                value={limitForm.maxActive}
                onChange={(event) => setLimits({ ...limitForm, maxActive: event.target.value })}
                disabled={savingLimits}
              />
            )}
          </Field>
          <Field label="같은 채널 최소 간격(분)" description={`1~${SCHEDULED_MESSAGE_MIN_INTERVAL_LIMIT}, 기본 10`}>
            {({ id }) => (
              <Input
                id={id}
                type="number"
                min={1}
                max={SCHEDULED_MESSAGE_MIN_INTERVAL_LIMIT}
                value={limitForm.minIntervalMinutes}
                onChange={(event) => setLimits({ ...limitForm, minIntervalMinutes: event.target.value })}
                disabled={savingLimits}
              />
            )}
          </Field>
        </div>
        <Button variant="secondary" size="md" loading={savingLimits} disabled={limits === null} onClick={() => void handleSaveLimits()}>
          상한·간격 저장
        </Button>
      </section>

      <InfoBox>
        <p>
          봇에게 보낼 채널의 보기·메시지 보내기 권한이 필요해요. 보내지 못하면 두 번 더 다시 시도하고, 그래도 안 되면 만든 사람에게 DM으로 알려요.
          Discord에서는 <strong>/공지</strong> 명령으로도 만들고 지울 수 있어요.
        </p>
      </InfoBox>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="예약 삭제"
        confirmLabel="삭제하기"
        loading={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleDelete()}
      >
        {deleteTarget ? <>{deleteTarget.runAt} 예약({deleteTarget.repeat})을 지울까요? 반복 예약이면 이후 회차도 모두 사라져요.</> : null}
      </ConfirmDialog>
    </Card>
  );
}
