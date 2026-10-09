"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ChartBar, House, ListMusic, Server, User } from "lucide-react";

import { type CommandItem,CommandPalette } from "@/components/overlay/command-palette";
import { useUIStore } from "@/store/use-ui-store";

const NAV_ICONS = {
  home: House,
  shards: Server,
  track: ChartBar,
  profile: User,
  playlists: ListMusic,
  servers: Server,
} as const;

export function GlobalCommandPalette() {
  const router = useRouter();
  const { status } = useSession();

  const open = useUIStore((s) => s.commandPaletteOpen);
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);

  // ⌘K / Ctrl+K 토글 ( 열기와 닫기 모두 여기서 처리해요 )
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(!open);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, setOpen]);

  const items = useMemo<CommandItem[]>(() => {
    const authenticated = status === "authenticated";
    const nav = (href: string) => () => router.push(href);
    const icon = (name: keyof typeof NAV_ICONS) => {
      const Icon = NAV_ICONS[name];
      return <Icon size={16} />;
    };

    const items: CommandItem[] = [
      { id: "go-home", label: "홈", icon: icon("home"), group: "이동", onSelect: nav("/") },
      { id: "go-shards", label: "서버 상태", icon: icon("shards"), group: "이동", onSelect: nav("/shards") },
      { id: "go-track", label: "음악 차트", icon: icon("track"), group: "이동", onSelect: nav("/track") },
    ];

    if (authenticated) {
      items.push(
        { id: "go-profile", label: "내 프로필", icon: icon("profile"), group: "이동", onSelect: nav("/profile") },
        {
          id: "go-playlists",
          label: "플레이리스트",
          icon: icon("playlists"),
          group: "이동",
          onSelect: nav("/playlists"),
        },
        { id: "go-servers", label: "서버 관리", icon: icon("servers"), group: "이동", onSelect: nav("/servers") },
      );
    }

    return items;
  }, [status, router]);

  return (
    <CommandPalette
      open={open}
      onClose={() => setOpen(false)}
      items={items}
      placeholder="페이지 검색..."
    />
  );
}