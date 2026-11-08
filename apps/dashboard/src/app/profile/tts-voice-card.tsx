"use client";

import { useMemo, useState } from "react";
import { Mic } from "lucide-react";

import { EmptyState } from "@/components/primitives/empty-state";
import type { EnrichedGuild } from "@/components/servers/guild-card.types";
import { type SearchableOption,SearchableSelect } from "@/components/servers/searchable-select";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import type { TtsVoiceOption } from "@/lib/data-api/tts";
import { discordGuildIconUrl } from "@/lib/discord-cdn";
import { useAuthedSWR } from "@/lib/swr";

/** "기본" 선택값 — SearchableSelect는 빈 문자열을 선택 안 됨으로 보므로 별도 값을 써요 */
const AUTO = "__auto__";

/**
 * 서버별 TTS 음성 카드 — 생일 카드처럼 평소엔 현재 음성만 조용히 보여주고,
 * "변경"을 누른 줄만 셀렉트로 바뀌어요. 봇 `/tts 설정` 패널과 같은 TtsUserSetting.voice를 쓰고,
 * 봇 캐시(60초) 뒤에 반영돼요.
 */
export function TtsVoiceCard() {
  const guilds = useAuthedSWR<{ guilds: EnrichedGuild[] }>("/api/servers", "/profile");
  const voices = useAuthedSWR<{ items: TtsVoiceOption[] }>("/api/profile/tts-voices", "/profile");
  const saved = useAuthedSWR<{ voices: Record<string, string> }>("/api/profile/tts", "/profile");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(AUTO);
  const [pending, setPending] = useState(false);

  const catalog = voices.data?.items;
  const options = useMemo<SearchableOption[]>(
    () => [
      { value: AUTO, label: "자동 (글 언어에 맞춰 선택)" },
      ...(catalog ?? []).map((voice) => ({
        value: voice.id,
        label: voice.languages.length > 0 ? `${voice.name} · ${voice.languages.join(", ")}` : voice.name,
        group: voice.engine || "기타",
      })),
    ],
    [catalog],
  );
  const labelOf = (id: string | undefined) => (id ? (options.find((option) => option.value === id)?.label ?? id) : null);

  const installed = (guilds.data?.guilds ?? []).filter((guild) => guild.isInstalled);
  const loading = guilds.isLoading || saved.isLoading;

  const startEditing = (guildId: string) => {
    setDraft(saved.data?.voices[guildId] ?? AUTO);
    setEditingId(guildId);
  };

  const save = async (guildId: string) => {
    const voice = draft === AUTO ? null : draft;
    setPending(true);
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
      setEditingId(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "음성을 저장하지 못했어요.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Card padding="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mic className="h-4 w-4 text-primary-text" aria-hidden />
          TTS 음성
        </CardTitle>
        <CardDescription className="text-xs leading-tight">서버마다 다른 목소리로 읽을 수 있어요. 반영까지 최대 1분 걸려요.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <Skeleton className="h-11 w-full" />
        ) : installed.length === 0 ? (
          <EmptyState size="sm" icon={Mic} title="시루봇이 있는 서버가 없어요" description="서버에 시루봇을 초대하면 여기서 음성을 고를 수 있어요." />
        ) : voices.error ? (
          <p className="text-sm text-muted-foreground">음성 목록을 불러오지 못했어요. 잠시 후 다시 방문해 주세요.</p>
        ) : (
          installed.map((guild) => {
            const editing = editingId === guild.id;
            const current = labelOf(saved.data?.voices[guild.id]);
            return (
              <div key={guild.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control bg-surface-2 px-3 py-2">
                <Avatar
                  size="xs"
                  src={guild.icon ? discordGuildIconUrl(guild.id, guild.icon, 64) : undefined}
                  alt=""
                  fallback={guild.name.slice(0, 1)}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">{guild.name}</span>
                {editing ? (
                  <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-1 sm:justify-end">
                    <div className="min-w-0 flex-1 sm:max-w-72">
                      <SearchableSelect
                        options={options}
                        value={draft}
                        onChange={setDraft}
                        searchable
                        searchPlaceholder="음성 검색…"
                        disabled={pending}
                      />
                    </div>
                    <Button variant="ghost" size="sm" disabled={pending} onClick={() => setEditingId(null)}>
                      취소
                    </Button>
                    <Button variant="primary" size="sm" loading={pending} onClick={() => void save(guild.id)}>
                      저장
                    </Button>
                  </div>
                ) : (
                  <>
                    <span className={current ? "truncate text-sm font-medium text-foreground/90" : "text-sm text-muted-foreground"}>
                      {current ?? "자동"}
                    </span>
                    <Button variant="secondary" size="sm" className="shrink-0" onClick={() => startEditing(guild.id)}>
                      변경
                    </Button>
                  </>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
