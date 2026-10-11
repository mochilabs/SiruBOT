"use client";

import { Plus } from "lucide-react";

import type { SelectOption } from "@/components/overlay/select";
import { Select } from "@/components/overlay/select";
import { Button } from "@/components/primitives/button";
import type { Playlist } from "@/types/playlist";

interface PlaylistSelectMobileProps {
	playlists: Playlist[];
	activePlaylistId: string | null;
	onSelect: (id: string) => void;
	onCreateNew: () => void;
}

/**
 * 모바일(<lg)용 플레이리스트 선택 — 세로로 큰 카드 목록 대신 select 메뉴 하나로.
 * 즐겨찾기/내 목록 그룹은 option group으로, 곡수는 라벨에 붙여요.
 */
export function PlaylistSelectMobile({ playlists, activePlaylistId, onSelect, onCreateNew }: PlaylistSelectMobileProps) {
	const favorited = playlists[0]?.name === "즐겨찾기" ? playlists.slice(0, 1) : [];
	const customs = favorited.length ? playlists.slice(1) : playlists;
	const label = (playlist: Playlist) => `${playlist.name} · ${playlist._count?.tracks ?? 0}곡`;

	const options: SelectOption[] = [
		...favorited.map((playlist) => ({ value: playlist.id, label: label(playlist), group: "즐겨찾기" })),
		...customs.map((playlist) => ({ value: playlist.id, label: label(playlist), group: "내 목록" })),
	];

	return (
		<div className="flex w-full items-center gap-2">
			<Select
				className="min-w-0 flex-1"
				options={options}
				value={activePlaylistId ?? undefined}
				onChange={onSelect}
				placeholder="플레이리스트 선택..."
			/>
			<Button
				variant="icon"
				size="sm"
				onClick={onCreateNew}
				aria-label="새 플레이리스트"
				className="h-11 w-11 shrink-0 rounded-control border border-border-subtle bg-surface-1 p-3 text-muted-foreground hover:border-primary/30 hover:bg-surface-2 hover:text-primary-text"
			>
				<Plus size={16} />
			</Button>
		</div>
	);
}