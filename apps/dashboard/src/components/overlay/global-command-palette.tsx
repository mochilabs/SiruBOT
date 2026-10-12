"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ChartBar, House, ListMusic, Server, User } from "lucide-react";

import {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { useUIStore } from "@/store/use-ui-store";

interface CommandItemData {
	id: string;
	label: string;
	icon: ReactNode;
	group: string;
	onSelect: () => void;
}

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
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
				e.preventDefault();
				// Read state at event time so the listener binds exactly once, not on every toggle
				const { commandPaletteOpen, setCommandPaletteOpen } = useUIStore.getState();
				setCommandPaletteOpen(!commandPaletteOpen);
			}
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, []);

	const items = useMemo<CommandItemData[]>(() => {
		const authenticated = status === "authenticated";
		const nav = (href: string) => () => router.push(href);
		const icon = (name: keyof typeof NAV_ICONS) => {
			const Icon = NAV_ICONS[name];
			return <Icon size={16} aria-hidden />;
		};

		const list: CommandItemData[] = [
			{ id: "go-home", label: "홈", icon: icon("home"), group: "이동", onSelect: nav("/") },
			{ id: "go-shards", label: "서버 상태", icon: icon("shards"), group: "이동", onSelect: nav("/shards") },
			{ id: "go-track", label: "음악 차트", icon: icon("track"), group: "이동", onSelect: nav("/track") },
		];

		if (authenticated) {
			list.push(
				{ id: "go-profile", label: "내 프로필", icon: icon("profile"), group: "이동", onSelect: nav("/profile") },
				{ id: "go-playlists", label: "플레이리스트", icon: icon("playlists"), group: "이동", onSelect: nav("/playlists") },
				{ id: "go-servers", label: "서버 관리", icon: icon("servers"), group: "이동", onSelect: nav("/servers") },
			);
		}

		return list;
	}, [status, router]);

	const handleSelect = (itemValue: string) => {
		const item = items.find((i) => i.id === itemValue);
		if (item) {
			item.onSelect();
			setOpen(false);
		}
	};

	return (
		<CommandDialog open={open} onOpenChange={(next) => setOpen(next)} title="명령 팔레트" description="페이지를 검색해 이동해요.">
			<Command>
				<CommandInput placeholder="페이지 검색..." />
				<CommandList>
					<CommandEmpty>결과가 없어요.</CommandEmpty>
					<CommandGroup heading="이동">
						{items.map((item) => (
							<CommandItem key={item.id} value={item.id} keywords={[item.label]} onSelect={handleSelect}>
								{item.icon}
								{item.label}
							</CommandItem>
						))}
					</CommandGroup>
				</CommandList>
			</Command>
		</CommandDialog>
	);
}
