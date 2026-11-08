"use client";

import { useMemo, useState } from "react";
import { Mic } from "lucide-react";

import { EmptyState } from "@/components/primitives/empty-state";
import type { EnrichedGuild } from "@/components/servers/guild-card.types";
import { type SearchableOption,SearchableSelect } from "@/components/servers/searchable-select";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import type { TtsVoiceOption } from "@/lib/data-api/tts";
import { discordGuildIconUrl } from "@/lib/discord-cdn";
import { useAuthedSWR } from "@/lib/swr";

/** "기본" 선택값 — SearchableSelect는 빈 문자열을 선택 안 됨으로 보므로 별도 값을 써요 */
const AUTO = "__auto__";

/**
 * 서버별 TTS 음성 카드 — 시루봇이 있는 서버마다 내 낭독 음성을 고르게 해요.
 * 봇 `/tts 설정` 패널과 같은 TtsUserSetting.voice를 쓰고, 봇 캐시(60초) 뒤에 반영돼요.
 */
export function TtsVoiceCard() {
  const guilds = useAuthedSWR<{ guilds: EnrichedGuild[] }>("/api/servers", "/profile");
  const voices = useAuthedSWR<{ items: TtsVoiceOption[] }>("/api/profile/tts-voices", "/profile");
  const saved = useAuthedSWR<{ voices: Record<string, string> }>("/api/profile/tts", "/profile");
  const [pending, setPending] = useState<string | null>(null);

  const options = useMemo<SearchableOption[]>(() => {
    const items = voices.data?.items ?? [];
    return [
      { value: AUTO, label: "자동 (글 언어에 맞춰 선택)" },
      ...items.map((voice) => ({
        value: voice.id,
        label: voice.languages.length > 0 ? `${voice.name} · ${voice.languages.join(", ")}` : voice.name,
        group: voice.engine || "기타",
      })),
    ];
  }, [voices.data]);

  const installed = (guilds.data?.guilds ?? []).filter((guild) => guild.isInstalled);
  const loading = guilds.isLoading || saved.isLoading;

  const change = async (guildId: string, next: string) => {
    const voice = next === AUTO ? null : next;
    setPending(guildId);
    try {
      const res = await fetch(`/api/servers/${guildId}/tts`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "음성을 저장하지 못했어요.");
      }
      await saved.mutate(
        (current) => {
          const map = { ...(current?.voices ?? {}) };
          if (voice) map[guildId] = voice;
          else delete map[guildId];
          return { voices: map };
        },
        { revalidate: false },
      );
      toast.success(voice ? "TTS 음성을 바꿨어요." : "TTS 음성을 자동으로 돌렸어요.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "음성을 저장하지 못했어요.");
    } finally {
      setPending(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mic className="h-4 w-4 text-primary-text" aria-hidden />
          서버별 TTS 음성
        </CardTitle>
        <CardDescription>채팅 낭독과 /tts 말하기에서 서버마다 다른 목소리를 쓸 수 있어요. 반영까지 최대 1분 걸려요.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <>
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </>
        ) : installed.length === 0 ? (
          <EmptyState size="sm" icon={Mic} title="시루봇이 있는 서버가 없어요" description="서버에 시루봇을 초대하면 여기서 음성을 고를 수 있어요." />
        ) : voices.error ? (
          <p className="text-sm text-muted-foreground">음성 목록을 불러오지 못했어요. 잠시 후 다시 방문해 주세요.</p>
        ) : (
          installed.map((guild) => (
            <div key={guild.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <div className="flex min-w-0 items-center gap-3 sm:w-56">
                <Avatar
                  size="xs"
                  src={guild.icon ? discordGuildIconUrl(guild.id, guild.icon, 64) : undefined}
                  alt=""
                  fallback={guild.name.slice(0, 1)}
                />
                <span className="truncate text-sm font-bold text-foreground">{guild.name}</span>
              </div>
              <div className="min-w-0 flex-1">
                <SearchableSelect
                  options={options}
                  value={saved.data?.voices[guild.id] ?? AUTO}
                  onChange={(next) => void change(guild.id, next)}
                  searchable
                  searchPlaceholder="음성 검색…"
                  disabled={pending === guild.id || voices.isLoading}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
