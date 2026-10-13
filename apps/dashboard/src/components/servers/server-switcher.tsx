"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Search } from "lucide-react";
import useSWR from "swr";

import type { EnrichedGuild } from "@/components/servers/guild-card.types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { discordGuildIconUrl } from "@/lib/discord-cdn";
import { buildInviteUrl } from "@/utils";

import { hasUnsavedSettings } from "./settings-shared";

interface ServerListResponse {
  guilds: EnrichedGuild[];
}

function GuildIcon({ guild }: { guild: EnrichedGuild }) {
  if (guild.icon) {
    return (
      <Image
        src={discordGuildIconUrl(guild.id, guild.icon, 64)}
        alt=""
        width={32}
        height={32}
        className="h-8 w-8 shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-bold text-muted-foreground"
      aria-hidden
    >
      {guild.name.slice(0, 1)}
    </span>
  );
}

export function ServerSwitcher({
  guildId,
  guildName,
  icon,
}: {
  guildId: string;
  guildName: string;
  icon: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, isLoading } = useSWR<ServerListResponse>("/api/servers");
  const [query, setQuery] = useState("");
  const manageableGuilds = useMemo(
    () =>
      (data?.guilds ?? []).filter(
        (guild) =>
          guild.isManageable &&
          guild.name.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [data?.guilds, query],
  );
  const tab = searchParams.get("tab") ?? "ai";

  const selectGuild = (guild: EnrichedGuild) => {
    if (!guild.isInstalled) {
      window.open(
        buildInviteUrl({ guildId: guild.id }),
        "_blank",
        "noopener,noreferrer",
      );
      return;
    }
    if (
      guild.id !== guildId &&
      hasUnsavedSettings() &&
      !window.confirm(
        "저장하지 않은 변경 사항이 있어요. 서버를 바꾸면 편집 내용이 사라져요. 계속할까요?",
      )
    ) {
      return;
    }
    router.push(`/servers/${guild.id}?tab=${encodeURIComponent(tab)}`);
  };

  const currentIcon = icon ? (
    <Image
      src={discordGuildIconUrl(guildId, icon, 64)}
      alt=""
      width={40}
      height={40}
      className="h-10 w-10 shrink-0 rounded-full object-cover"
    />
  ) : (
    <span
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-base font-bold text-muted-foreground"
      aria-hidden
    >
      {guildName.slice(0, 1)}
    </span>
  );

  const options = manageableGuilds.map((guild) => (
    <DropdownMenuItem
      key={guild.id}
      onClick={() => selectGuild(guild)}
      className="min-h-11 gap-2"
    >
      <GuildIcon guild={guild} />
      <span className="min-w-0 flex-1 truncate">{guild.name}</span>
      {guild.id === guildId ? (
        <span className="text-xs text-muted-foreground">현재</span>
      ) : null}
      {!guild.isInstalled ? (
        <span className="text-xs text-primary-text">초대</span>
      ) : null}
    </DropdownMenuItem>
  ));

  const switcherContent = (
    <>
      {currentIcon}
      <span className="min-w-0 flex-1 truncate">{guildName}</span>
      <ChevronDown size={18} className="shrink-0 text-muted-foreground" aria-hidden />
    </>
  );

  return (
    <div className="min-w-0">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              aria-label={`${guildName} 서버 선택`}
              className="hidden h-auto max-w-full min-w-0 justify-start gap-3 rounded-control px-0 py-0 text-inherit font-[inherit] tracking-[inherit] hover:bg-transparent sm:inline-flex"
            >
              {switcherContent}
            </Button>
          }
        />
        <DropdownMenuContent
          align="start"
          className="hidden max-h-[min(70dvh,32rem)] w-80 sm:block"
        >
          <div className="sticky top-0 z-10 bg-popover p-1">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="서버 검색"
                className="pl-9"
                aria-label="서버 검색"
              />
            </div>
          </div>
          {isLoading ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              서버 불러오는 중…
            </p>
          ) : options.length ? (
            options
          ) : (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              검색 결과가 없어요.
            </p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Sheet>
        <SheetTrigger
          render={
            <Button
              variant="ghost"
              aria-label={`${guildName} 서버 선택`}
              className="h-auto max-w-full min-w-0 justify-start gap-3 rounded-control px-0 py-0 text-inherit font-[inherit] tracking-[inherit] hover:bg-transparent sm:hidden"
            >
              {switcherContent}
            </Button>
          }
        />
        <SheetContent side="bottom" className="max-h-[85dvh] rounded-t-dialog">
          <SheetHeader className="px-4 pt-5">
            <SheetTitle>서버 선택</SheetTitle>
            <SheetDescription>
              관리할 서버를 고르거나 봇을 초대해요.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="서버 검색"
                className="pl-9"
                aria-label="서버 검색"
              />
            </div>
          </div>
          <div className="min-h-0 overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {isLoading ? (
              <p className="px-2 py-4 text-sm text-muted-foreground">
                서버 불러오는 중…
              </p>
            ) : manageableGuilds.length ? (
              manageableGuilds.map((guild) => (
                <button
                  key={guild.id}
                  type="button"
                  onClick={() => selectGuild(guild)}
                  className="flex min-h-12 w-full items-center gap-3 rounded-control px-3 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <GuildIcon guild={guild} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {guild.name}
                  </span>
                  {guild.id === guildId ? (
                    <span className="text-xs text-muted-foreground">현재</span>
                  ) : null}
                  {!guild.isInstalled ? (
                    <span className="text-xs text-primary-text">초대</span>
                  ) : null}
                </button>
              ))
            ) : (
              <p className="px-2 py-4 text-sm text-muted-foreground">
                검색 결과가 없어요.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
