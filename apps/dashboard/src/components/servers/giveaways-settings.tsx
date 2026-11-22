"use client";

import { useCallback, useMemo, useState } from "react";
import { buildGiveawayConditions, GIVEAWAY_DAYS_MAX, GIVEAWAY_PRIZE_MAX, GIVEAWAY_WINNERS_MAX } from "@sirubot/utils/giveaway";
import { Gift } from "lucide-react";
import useSWR from "swr";

import { ChannelSelect } from "@/components/discord/channel-select";
import { CHANNEL_TYPE_GROUP } from "@/components/discord/discord-options";
import { RoleSelect } from "@/components/discord/role-select";
import { ConfirmDialog } from "@/components/primitives/confirm-dialog";
import { EmptyState } from "@/components/primitives/empty-state";
import { Field } from "@/components/primitives/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { useGuildChannels, useGuildRoles } from "@/hooks/use-guild-settings";
import { toApiError, toError } from "@/lib/api-error";
import type { GiveawayItem, GiveawayList } from "@/lib/giveaways";
import { notifyApiError } from "@/lib/notify";
import { createApiFetcher } from "@/lib/swr";

import { ChannelListError, InfoBox, PanelError, PanelHeader, PanelLoading } from "./settings-shared";

const fetcher = createApiFetcher<GiveawayList>("나눔을 불러오지 못했어요.", { sessionRetry: true });

const STATUS_BADGE = {
  running: { label: "진행 중", variant: "info" },
  ended: { label: "종료", variant: "secondary" },
  cancelled: { label: "취소", variant: "danger" },
} as const;

type StatusFilter = "all" | keyof typeof STATUS_BADGE;

const FILTERS: readonly { key: StatusFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "running", label: "진행 중" },
  { key: "ended", label: "종료" },
  { key: "cancelled", label: "취소" },
];

const dateFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  dateStyle: "medium",
  timeStyle: "short",
});

/** 지금부터 1시간 뒤를 "YYYY-MM-DDTHH:mm"(KST)로 — 마감 입력 기본값 */
function defaultEndsAt(): string {
  return new Date(Date.now() + 9 * 60 * 60_000 + 60 * 60_000).toISOString().slice(0, 16);
}

type PendingAction = { kind: "end" | "cancel" | "reroll"; item: GiveawayItem };

const ACTION_COPY = {
  end: { title: "지금 마감", confirm: "마감하고 추첨", error: "마감하지 못했어요.", done: "마감하고 당첨자를 뽑았어요." },
  cancel: { title: "나눔 취소", confirm: "취소하기", error: "취소하지 못했어요.", done: "나눔을 취소했어요." },
  reroll: { title: "다시 뽑기", confirm: "다시 뽑기", error: "다시 뽑지 못했어요.", done: "새 당첨자를 뽑아 발표했어요." },
} as const;

export function GiveawaysSettings({ guildId }: { guildId: string }) {
  const base = `/api/servers/${guildId}/giveaways`;
  const { data, error, isLoading, mutate } = useSWR<GiveawayList>(base, fetcher, {
    // 진행 중 참여자 수를 가끔 새로 읽어요
    refreshInterval: 30_000,
  });
  const { channels, error: channelsError, reload: reloadChannels } = useGuildChannels(guildId, true);
  const { roles } = useGuildRoles(guildId, true);

  const [filter, setFilter] = useState<StatusFilter>("all");

  // 새 나눔 폼
  const [channelId, setChannelId] = useState("");
  const [prize, setPrize] = useState("");
  const [winnerCount, setWinnerCount] = useState("1");
  const [endsAt, setEndsAt] = useState(defaultEndsAt);
  const [requiredRoleIds, setRequiredRoleIds] = useState<string[]>([]);
  const [requiredMatch, setRequiredMatch] = useState<"any" | "all">("any");
  const [blockedRoleIds, setBlockedRoleIds] = useState<string[]>([]);
  const [minJoinDays, setMinJoinDays] = useState("");
  const [minAccountDays, setMinAccountDays] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // 종료·취소·다시 뽑기
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [rerollCount, setRerollCount] = useState("1");
  const [acting, setActing] = useState(false);

  /** 조건 문장 속 `<@&id>`를 역할 이름으로 바꿔요 */
  const roleText = useCallback(
    (text: string) =>
      text.replace(/<@&(\d+)>/g, (_match, id: string) => `@${roles?.find((role) => role.id === id)?.name ?? "삭제된 역할"}`),
    [roles],
  );

  const all = useMemo(() => (data ? [...data.running, ...data.past] : []), [data]);
  const counts = useMemo(
    () => ({
      all: all.length,
      running: all.filter((item) => item.status === "running").length,
      ended: all.filter((item) => item.status === "ended").length,
      cancelled: all.filter((item) => item.status === "cancelled").length,
    }),
    [all],
  );
  const visible = useMemo(() => (filter === "all" ? all : all.filter((item) => item.status === filter)), [all, filter]);

  const handleCreate = useCallback(async () => {
    setFormError(null);
    if (!channelId) return setFormError("나눔 카드를 올릴 채널을 선택해 주세요.");
    if (!prize.trim()) return setFormError("상품을 입력해 주세요.");
    setCreating(true);
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId,
          prize,
          winnerCount: Number(winnerCount),
          endsAt: endsAt.replace("T", " "),
          conditions: buildGiveawayConditions({
            requiredRoleIds,
            requiredMatch,
            blockedRoleIds,
            minJoinDays: minJoinDays ? Number(minJoinDays) : null,
            minAccountAgeDays: minAccountDays ? Number(minAccountDays) : null,
          }),
        }),
      });
      if (!res.ok) throw await toApiError(res, "나눔을 시작하지 못했어요.");
      setPrize("");
      setWinnerCount("1");
      setEndsAt(defaultEndsAt());
      setRequiredRoleIds([]);
      setBlockedRoleIds([]);
      setRequiredMatch("any");
      setMinJoinDays("");
      setMinAccountDays("");
      setFilter("running");
      await mutate();
      toast.success("나눔을 시작했어요.", "선택한 채널에 참여 카드를 올렸어요.");
    } catch (err) {
      // 진행 중 상한·채널 권한 같은 사유는 폼 안에서 바로 읽을 수 있게 보여줘요
      setFormError(toError(err, "나눔을 시작하지 못했어요.").message);
    } finally {
      setCreating(false);
    }
  }, [base, channelId, prize, winnerCount, endsAt, requiredRoleIds, requiredMatch, blockedRoleIds, minJoinDays, minAccountDays, mutate]);

  const handleAction = useCallback(async () => {
    if (!pending) return;
    const copy = ACTION_COPY[pending.kind];
    setActing(true);
    try {
      const res = await fetch(`${base}/${pending.item.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pending.kind === "reroll" ? { action: "reroll", count: Number(rerollCount) } : { action: pending.kind }),
      });
      if (!res.ok) throw await toApiError(res, copy.error);
      setPending(null);
      await mutate();
      toast.success(copy.done);
    } catch (err) {
      notifyApiError(err, copy.error);
    } finally {
      setActing(false);
    }
  }, [base, pending, rerollCount, mutate]);

  if (isLoading || (!data && !error)) return <PanelLoading label="나눔 불러오는 중…" />;
  if (error) return <PanelError error={toError(error, "나눔을 불러오지 못했어요.")} onRetry={() => void mutate()} />;
  if (!data) return <PanelLoading label="나눔 불러오는 중…" />;

  const renderItem = (item: GiveawayItem) => (
    <li key={item.id} className="space-y-2 rounded-control bg-surface-2 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
            <Badge size="sm" variant={STATUS_BADGE[item.status].variant}>
              {STATUS_BADGE[item.status].label}
            </Badge>
            <span>
              {item.status === "running" ? "마감" : "종료"} {dateFormat.format(new Date(item.endsAt))}
            </span>
            <span>· #{channels?.find((c) => c.id === item.channelId)?.name ?? item.channelId}</span>
          </div>
          <p className="break-words text-sm font-bold text-foreground">{item.prize}</p>
          <p className="text-xs text-muted-foreground">
            당첨 {item.winnerCount}명 · 참여 {item.entryCount}명
            {item.eligibleCount !== null && ` (조건 통과 ${item.eligibleCount}명)`}
          </p>
          {item.conditions.length > 0 && (
            <p className="break-words text-xs text-muted-foreground">조건: {item.conditions.map(roleText).join(" / ")}</p>
          )}
          {item.status === "ended" && (
            <p className="break-all text-xs text-foreground">
              {item.winnerIds.length > 0 ? `당첨자 ID: ${item.winnerIds.join(", ")}` : "당첨자 없음"}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {item.status === "running" && (
            <>
              <Button variant="secondary" size="sm" onClick={() => setPending({ kind: "end", item })}>
                지금 마감
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setPending({ kind: "cancel", item })}>
                취소
              </Button>
            </>
          )}
          {item.status === "ended" && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setRerollCount("1");
                setPending({ kind: "reroll", item });
              }}
            >
              다시 뽑기
            </Button>
          )}
        </div>
      </div>
    </li>
  );

  return (
    <Card padding="lg" className="gap-6 overflow-visible">
      <PanelHeader
        icon={<Gift className="h-5 w-5" />}
        title="나눔"
        description="참여 조건을 직접 정해 나눔을 열고, 진행 중·종료·취소 상태별로 관리해요. Discord의 /나눔 명령과 같은 기능이에요."
      />

      <section className="space-y-4">
        <h3 className="text-sm font-bold text-foreground">새 나눔</h3>
        <Field label="카드를 올릴 채널" description="참여 버튼이 달린 카드가 이 채널에 올라가요. 봇에게 보기·메시지 보내기 권한이 필요해요.">
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
        <Field label="상품" description={`${prize.length}/${GIVEAWAY_PRIZE_MAX} · @everyone, @here는 쓸 수 없어요.`}>
          {({ id }) => <Input id={id} value={prize} maxLength={GIVEAWAY_PRIZE_MAX} onChange={(event) => setPrize(event.target.value)} disabled={creating} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="당첨자 수" description={`1~${GIVEAWAY_WINNERS_MAX}명`}>
            {({ id }) => (
              <Input
                id={id}
                type="number"
                min={1}
                max={GIVEAWAY_WINNERS_MAX}
                value={winnerCount}
                onChange={(event) => setWinnerCount(event.target.value)}
                disabled={creating}
              />
            )}
          </Field>
          <Field label="마감 (한국 시간)" description="지금부터 1분 뒤 ~ 30일 안">
            {({ id }) => <Input id={id} type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} disabled={creating} />}
          </Field>
        </div>

        <div className="space-y-4 rounded-control bg-surface-2 p-3">
          <p className="text-sm font-bold text-foreground">참여 조건 (선택)</p>
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <Field label="필요한 역할" description="비워 두면 누구나 참여할 수 있어요.">
              <RoleSelect multiple roles={roles} value={requiredRoleIds} onChange={setRequiredRoleIds} disabled={creating} placeholder="역할을 선택해 주세요" />
            </Field>
            <Field label="여러 개일 때">
              <Select value={requiredMatch} disabled={creating} onValueChange={(value) => setRequiredMatch(value === "all" ? "all" : "any")}>
                <SelectTrigger className="w-full sm:w-40" aria-label="필요한 역할이 여러 개일 때">
                  <SelectValue>{(value) => (value === "all" ? "모두 있어야" : "하나라도 있으면")}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">하나라도 있으면</SelectItem>
                  <SelectItem value="all">모두 있어야</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="제외할 역할" description="이 역할이 있으면 참여할 수 없어요.">
            <RoleSelect multiple roles={roles} value={blockedRoleIds} onChange={setBlockedRoleIds} disabled={creating} placeholder="역할을 선택해 주세요" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="서버 가입 일수" description={`N일 이상 (1~${GIVEAWAY_DAYS_MAX}, 비우면 제한 없음)`}>
              {({ id }) => (
                <Input id={id} type="number" min={1} max={GIVEAWAY_DAYS_MAX} value={minJoinDays} onChange={(event) => setMinJoinDays(event.target.value)} disabled={creating} />
              )}
            </Field>
            <Field label="계정 생성 일수" description={`디스코드 계정을 만든 지 N일 이상 (1~${GIVEAWAY_DAYS_MAX})`}>
              {({ id }) => (
                <Input id={id} type="number" min={1} max={GIVEAWAY_DAYS_MAX} value={minAccountDays} onChange={(event) => setMinAccountDays(event.target.value)} disabled={creating} />
              )}
            </Field>
          </div>
        </div>

        {formError && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {formError}
          </p>
        )}
        <Button variant="primary" size="md" loading={creating} onClick={() => void handleCreate()}>
          나눔 시작
        </Button>
      </section>

      <section className="space-y-3 border-t border-border pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-foreground">나눔 목록</h3>
          <div role="group" aria-label="상태별 보기" className="flex flex-wrap gap-1.5">
            {FILTERS.map((item) => (
              <Button
                key={item.key}
                size="sm"
                variant={filter === item.key ? "primary" : "secondary"}
                aria-pressed={filter === item.key}
                onClick={() => setFilter(item.key)}
              >
                {item.label} {counts[item.key]}
              </Button>
            ))}
          </div>
        </div>
        {visible.length === 0 ? (
          <EmptyState
            size="sm"
            icon={Gift}
            title={filter === "all" ? "아직 나눔이 없어요" : `${FILTERS.find((item) => item.key === filter)?.label} 상태인 나눔이 없어요`}
            description={filter === "all" || filter === "running" ? "위에서 새 나눔을 시작해 보세요." : undefined}
          />
        ) : (
          <ul className="space-y-2">{visible.map(renderItem)}</ul>
        )}
        <p className="text-xs text-muted-foreground">종료·취소된 나눔은 최근 {data.past.length}건까지 보여줘요.</p>
      </section>

      <InfoBox>
        <p>
          조건은 마감 시점에 한 번 더 확인해서, 그 사이 역할을 잃었거나 서버를 나간 참여자는 추첨에서 빠져요. 서버당 진행 중인 나눔은 동시에 최대 10개예요.
        </p>
      </InfoBox>

      <ConfirmDialog
        open={pending !== null}
        title={pending ? ACTION_COPY[pending.kind].title : ""}
        confirmLabel={pending ? ACTION_COPY[pending.kind].confirm : "확인"}
        variant={pending?.kind === "cancel" ? "danger" : "primary"}
        loading={acting}
        onClose={() => setPending(null)}
        onConfirm={() => void handleAction()}
      >
        {pending?.kind === "end" && <>「{pending.item.prize}」을(를) 지금 마감하고 당첨자를 뽑을까요? 결과는 채널에 바로 발표돼요.</>}
        {pending?.kind === "cancel" && <>「{pending.item.prize}」을(를) 추첨 없이 취소할까요? 되돌릴 수 없어요.</>}
        {pending?.kind === "reroll" && (
          <div className="space-y-3">
            <p>「{pending.item.prize}」에서 이미 뽑힌 사람을 빼고 새 당첨자를 더 뽑아요. 조건은 지금 다시 확인하고, 결과는 채널에 발표돼요.</p>
            <Field label="새로 뽑을 인원">
              {({ id }) => (
                <Input id={id} type="number" min={1} max={GIVEAWAY_WINNERS_MAX} value={rerollCount} onChange={(event) => setRerollCount(event.target.value)} />
              )}
            </Field>
          </div>
        )}
      </ConfirmDialog>
    </Card>
  );
}
