"use client";

import { useCallback } from "react";
import { Gift } from "lucide-react";
import useSWR from "swr";

import { EmptyState } from "@/components/primitives/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useGuildChannels, useGuildRoles } from "@/hooks/use-guild-settings";
import { toError } from "@/lib/api-error";
import type { GiveawayItem, GiveawayList } from "@/lib/giveaways";
import { createApiFetcher } from "@/lib/swr";

import { InfoBox, PanelError, PanelHeader, PanelLoading } from "./settings-shared";

const fetcher = createApiFetcher<GiveawayList>("기브어웨이를 불러오지 못했어요.", { sessionRetry: true });

const STATUS_BADGE = {
  running: { label: "진행 중", variant: "info" },
  ended: { label: "종료", variant: "secondary" },
  cancelled: { label: "취소", variant: "danger" },
} as const;

const dateFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  dateStyle: "medium",
  timeStyle: "short",
});

export function GiveawaysSettings({ guildId }: { guildId: string }) {
  const { data, error, isLoading, mutate } = useSWR<GiveawayList>(`/api/servers/${guildId}/giveaways`, fetcher, {
    // 진행 중 참여자 수를 가끔 새로 읽어요
    refreshInterval: 30_000,
  });
  const { channels } = useGuildChannels(guildId, true);
  const { roles } = useGuildRoles(guildId, true);

  /** 조건 문장 속 `<@&id>`를 역할 이름으로 바꿔요 */
  const roleText = useCallback(
    (text: string) =>
      text.replace(/<@&(\d+)>/g, (_match, id: string) => `@${roles?.find((role) => role.id === id)?.name ?? "삭제된 역할"}`),
    [roles],
  );

  if (isLoading || (!data && !error)) return <PanelLoading label="기브어웨이 불러오는 중…" />;
  if (error) return <PanelError error={toError(error, "기브어웨이를 불러오지 못했어요.")} onRetry={() => void mutate()} />;
  if (!data) return <PanelLoading label="기브어웨이 불러오는 중…" />;

  const renderItem = (item: GiveawayItem) => (
    <li key={item.id} className="space-y-1.5 rounded-control bg-surface-2 p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
        <Badge size="sm" variant={STATUS_BADGE[item.status].variant}>
          {STATUS_BADGE[item.status].label}
        </Badge>
        <span>{item.status === "running" ? "마감" : "종료"} {dateFormat.format(new Date(item.endsAt))}</span>
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
    </li>
  );

  return (
    <Card padding="lg" className="gap-6 overflow-visible">
      <PanelHeader
        icon={<Gift className="h-5 w-5" />}
        title="기브어웨이"
        description="진행 중인 기브어웨이와 지난 결과를 확인해요. 시작·종료·다시 뽑기는 Discord에서 해요."
      />

      <section className="space-y-3">
        <h3 className="text-sm font-bold text-foreground">
          진행 중 <span className="font-medium text-muted-foreground">{data.running.length}</span>
        </h3>
        {data.running.length === 0 ? (
          <EmptyState size="sm" icon={Gift} title="진행 중인 기브어웨이가 없어요" description="Discord에서 /기브어웨이 시작으로 열 수 있어요." />
        ) : (
          <ul className="space-y-2">{data.running.map(renderItem)}</ul>
        )}
      </section>

      <section className="space-y-3 border-t border-border pt-5">
        <h3 className="text-sm font-bold text-foreground">
          지난 기브어웨이 <span className="font-medium text-muted-foreground">{data.past.length}</span>
        </h3>
        {data.past.length === 0 ? (
          <p className="text-sm text-muted-foreground">아직 끝난 기브어웨이가 없어요.</p>
        ) : (
          <ul className="space-y-2">{data.past.map(renderItem)}</ul>
        )}
      </section>

      <InfoBox>
        <p>
          참여 조건(필요 역할, 서버 가입 일수, 제외 역할, 계정 나이)은 <strong>/기브어웨이 시작</strong>에서 정해요. 조건은 마감 시점에 한 번 더
          확인해서, 그 사이 역할을 잃었거나 서버를 나간 참여자는 추첨에서 빠져요.
        </p>
      </InfoBox>
    </Card>
  );
}
