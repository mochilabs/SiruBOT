"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Popover } from "@base-ui/react/popover";
import { Check, ChevronDown, Search } from "lucide-react";

import type { EnrichedGuild } from "@/components/servers/guild-card.types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { discordGuildIconUrl } from "@/lib/discord-cdn";
import { useAuthedSWR } from "@/lib/swr";
import { buildInviteUrl } from "@/utils";

import { hasUnsavedSettings } from "./settings-shared";

interface ServerListResponse { guilds: EnrichedGuild[] }

function GuildIcon({ id, name, icon }: { id: string; name: string; icon: string | null }) {
  return icon ? (
    <Image src={discordGuildIconUrl(id, icon, 64)} alt="" width={32} height={32} className="size-8 shrink-0 rounded-control object-cover" />
  ) : (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-surface-2 text-sm font-semibold text-muted-foreground" aria-hidden>{name.slice(0, 1)}</span>
  );
}

export function ServerSwitcher({ guildId, guildName, icon }: { guildId: string; guildName: string; icon: string | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // 세션 게이트는 useAuthedSWR이 담당해요 — servers/page.tsx와 같은 URL·계약
  const { data, error, isLoading, mutate } = useAuthedSWR<ServerListResponse>("/api/servers", "/servers");
  const [query, setQuery] = useState("");
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pendingGuild, setPendingGuild] = useState<EnrichedGuild | null>(null);
  const desktopTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const manageableGuilds = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return (data?.guilds ?? []).filter((guild) => guild.isManageable && guild.name.toLocaleLowerCase().includes(search));
  }, [data?.guilds, query]);
  const tab = searchParams.get("tab") ?? "ai";

  const closePicker = () => { setDesktopOpen(false); setMobileOpen(false); setQuery(""); };
  const navigate = (guild: EnrichedGuild) => {
    closePicker();
    router.push(`/servers/${guild.id}?tab=${encodeURIComponent(tab)}`);
  };
  const selectGuild = (guild: EnrichedGuild) => {
    if (!guild.isInstalled) { window.open(buildInviteUrl({ guildId: guild.id }), "_blank", "noopener,noreferrer"); return; }
    if (guild.id === guildId) { closePicker(); return; }
    if (hasUnsavedSettings()) { closePicker(); setPendingGuild(guild); return; }
    navigate(guild);
  };
  const triggerContent = (open: boolean) => <>
    <GuildIcon id={guildId} name={guildName} icon={icon} />
    <span className="min-w-0 flex-1 truncate text-left">{guildName}</span>
    <ChevronDown size={18} className={`shrink-0 text-muted-foreground transition-transform duration-base ${open ? "rotate-180" : ""}`} aria-hidden />
  </>;
  const searchBox = (
    <div className="shrink-0 p-3">
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="서버 이름으로 검색" className="min-h-11 pl-9 text-base sm:text-sm" aria-label="서버 검색" />
      </div>
    </div>
  );
  const list = (
    <div data-stagger className="min-h-0 overflow-y-auto overscroll-contain px-2 pb-2" aria-label="관리할 서버 목록">
      {isLoading ? <p role="status" className="p-4 text-sm text-muted-foreground">서버 불러오는 중…</p>
        : error ? <div className="space-y-2 p-3 text-sm"><p>서버 목록을 불러오지 못했어요.</p><Button variant="secondary" className="min-h-11" onClick={() => void mutate()}>다시 시도</Button></div>
        : manageableGuilds.length ? manageableGuilds.map((guild) => (
          <button key={guild.id} type="button" onClick={() => selectGuild(guild)}
            aria-current={guild.id === guildId ? "true" : undefined}
            className="flex min-h-12 w-full items-center gap-3 rounded-control px-3 py-2 text-left text-sm font-medium tracking-normal hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <GuildIcon id={guild.id} name={guild.name} icon={guild.icon} />
            <span className="min-w-0 flex-1 break-words">{guild.name}</span>
            {guild.id === guildId && <><Check size={16} aria-hidden /><span className="sr-only">현재 서버</span></>}
            {!guild.isInstalled && <span className="shrink-0 text-xs text-primary-text">봇 초대</span>}
          </button>
        )) : <p className="p-4 text-sm text-muted-foreground">{query ? "검색 결과가 없어요. 다른 이름으로 검색해 주세요." : "관리할 수 있는 서버가 없어요."}</p>}
    </div>
  );
  // 트리거는 표면 채움으로 배경과 구분되고, 열림·누름에서 chevron 회전과
  // 눌림(scale)으로 "작동하는 느낌"을 줘요
  const triggerClass = (open: boolean) =>
    `h-auto min-h-12 max-w-full min-w-0 justify-start gap-3 px-2 py-1 text-xl font-bold tracking-normal sm:text-2xl ` +
    `bg-surface-1 transition-[background-color,transform] duration-fast hover:bg-surface-2 active:scale-[0.98] ` +
    (open ? "bg-surface-2" : "");

  return (
    <div className="min-w-0 max-w-full">
      <Popover.Root open={desktopOpen} onOpenChange={setDesktopOpen}>
        <Popover.Trigger render={<Button ref={desktopTriggerRef} variant="ghost" aria-label={`${guildName} 서버 선택`} className={`hidden sm:inline-flex ${triggerClass(desktopOpen)}`}>{triggerContent(desktopOpen)}</Button>} />
        <Popover.Portal>
          <Popover.Positioner sideOffset={12} align="start" className="z-50">
            <Popover.Popup initialFocus={searchRef} className="pop-in flex max-h-[min(70dvh,var(--available-height))] w-96 max-w-[calc(100vw-2rem)] origin-(--transform-origin) flex-col overflow-hidden rounded-menu bg-popover text-sm font-medium tracking-normal text-popover-foreground shadow-2xl outline-none data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
              <Popover.Title className="sr-only">서버 선택</Popover.Title>
              {searchBox}{list}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger render={<Button ref={mobileTriggerRef} variant="ghost" aria-label={`${guildName} 서버 선택`} className={`sm:hidden ${triggerClass(mobileOpen)}`}>{triggerContent(mobileOpen)}</Button>} />
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-hidden rounded-t-dialog pb-[env(safe-area-inset-bottom)]">
          <SheetHeader className="px-4 pt-5"><SheetTitle>서버 선택</SheetTitle><SheetDescription>관리할 서버를 고르거나 봇을 초대해요.</SheetDescription></SheetHeader>
          {searchBox}{list}
        </SheetContent>
      </Sheet>
      <Dialog open={pendingGuild !== null} onOpenChange={(open) => { if (!open) setPendingGuild(null); }}>
        <DialogContent initialFocus={cancelRef} finalFocus={() => window.matchMedia("(min-width: 640px)").matches ? desktopTriggerRef.current : mobileTriggerRef.current} showCloseButton={false}>
          <DialogHeader><DialogTitle>저장하지 않고 서버를 바꿀까요?</DialogTitle><DialogDescription>저장하지 않은 변경 사항이 있어요. {pendingGuild?.name} 서버로 이동하면 현재 서버에서 편집한 내용은 사라져요.</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button ref={cancelRef} variant="secondary" className="min-h-11" onClick={() => setPendingGuild(null)}>계속 편집</Button>
            <Button variant="danger" className="min-h-11" onClick={() => { if (pendingGuild) navigate(pendingGuild); setPendingGuild(null); }}>변경 사항 버리고 이동</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
