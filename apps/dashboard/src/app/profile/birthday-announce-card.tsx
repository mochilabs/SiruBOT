"use client";

import { useState } from "react";
import { PartyPopper } from "lucide-react";

import { EmptyState } from "@/components/primitives/empty-state";
import type { EnrichedGuild } from "@/components/servers/guild-card.types";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { discordGuildIconUrl } from "@/lib/discord-cdn";
import { useAuthedSWR } from "@/lib/swr";

/**
 * 서버별 생일 축하 카드 — 서버마다 "이 서버에서 내 생일 축하받기"를 켜요. 봇 `/프로필 생일축하`와 같은 BirthdayOptIn이에요.
 * 생일을 등록하지 않았거나 서버가 생일 축하를 켜지 않았으면 켜 둬도 축하는 가지 않아요.
 */
export function BirthdayAnnounceCard({ hasBirthday }: { hasBirthday: boolean }) {
  const guilds = useAuthedSWR<{ guilds: EnrichedGuild[] }>("/api/servers", "/profile");
  const saved = useAuthedSWR<{ guildIds: string[] }>("/api/profile/birthday-guilds", "/profile");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const installed = (guilds.data?.guilds ?? []).filter((guild) => guild.isInstalled);
  const enabledIds = new Set(saved.data?.guildIds ?? []);
  const loading = guilds.isLoading || saved.isLoading;

  const toggle = async (guildId: string, enabled: boolean) => {
    setPendingId(guildId);
    try {
      const res = await fetch(`/api/servers/${guildId}/birthday/optin`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "설정을 저장하지 못했어요.");
      }
      await saved.mutate(
        (current) => {
          const next = new Set(current?.guildIds ?? []);
          if (enabled) next.add(guildId);
          else next.delete(guildId);
          return { guildIds: [...next] };
        },
        { revalidate: false },
      );
      toast.success(enabled ? "이 서버에서 생일 축하를 받아요." : "이 서버에서 생일 축하를 받지 않아요.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "설정을 저장하지 못했어요.");
    } finally {
      setPendingId(null);
    }
  };

  return (
    <Card padding="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PartyPopper className="h-4 w-4 text-primary-text" aria-hidden />
          생일 축하 받기
        </CardTitle>
        <CardDescription className="text-xs leading-tight">
          서버마다 따로 켜요. 켠 서버가 생일 축하를 사용 중이면 생일 당일에 카드로 축하해요.
          {!hasBirthday && " 먼저 위에서 생일을 등록해 주세요."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <Skeleton className="h-11 w-full" />
        ) : guilds.error || saved.error ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">서버 목록과 현재 설정을 불러오지 못했어요.</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void guilds.mutate();
                void saved.mutate();
              }}
            >
              다시 시도
            </Button>
          </div>
        ) : installed.length === 0 ? (
          <EmptyState size="sm" icon={PartyPopper} title="시루봇이 있는 서버가 없어요" description="서버에 시루봇을 초대하면 여기서 켤 수 있어요." />
        ) : (
          installed.map((guild) => (
            <div key={guild.id} className="flex items-center gap-x-3 rounded-control bg-surface-2 px-3 py-2">
              <Avatar
                size="xs"
                src={guild.icon ? discordGuildIconUrl(guild.id, guild.icon, 64) : undefined}
                alt=""
                fallback={guild.name.slice(0, 1)}
              />
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">{guild.name}</span>
              <Switch
                checked={enabledIds.has(guild.id)}
                disabled={pendingId !== null}
                onChange={(checked) => void toggle(guild.id, checked)}
                aria-label={`${guild.name}에서 생일 축하 받기`}
              />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
