"use client";

import { ChevronDown, Plus } from "lucide-react";

import { Button } from "@/components/primitives/button";
import { Select } from "@/components/primitives/input";
import type { Playlist } from "@/types/playlist";

interface PlaylistSelectMobileProps {
	playlists: Playlist[];
	activePlaylistId: string | null;
	onSelect: (id: string) => void;
	onCreateNew: () => void;
}

/**
 * 모바일(<lg)용 플레이리스트 선택 — 세로로 큰 카드 목록 대신 select 메뉴 하나로.
 * 즐겨찾기/내 목록 그룹은 optgroup으로, 곡수는 라벨에 붙여요.
 */
export function PlaylistSelectMobile({ playlists, activePlaylistId, onSelect, onCreateNew }: PlaylistSelectMobileProps) {
	const favorited = playlists[0]?.name === "즐겨찾기" ? playlists.slice(0, 1) : [];
	const customs = favorited.length ? playlists.slice(1) : playlists;
	const label = (playlist: Playlist) => `${playlist.name} · ${playlist._count?.tracks ?? 0}곡`;

	return (
		<div className="flex w-full items-center gap-2">
			<div className="relative min-w-0 flex-1">
				<Select
					aria-label="플레이리스트 선택"
					value={activePlaylistId ?? ""}
					onChange={(e) => {
						if (e.target.value) onSelect(e.target.value);
					}}
				>
					{!activePlaylistId && <option value="">플레이리스트 선택...</option>}
					{favorited.length > 0 && (
						<optgroup label="즐겨찾기">
							{favorited.map((playlist) => (
								<option key={playlist.id} value={playlist.id}>
									{label(playlist)}
								</option>
							))}
						</optgroup>
					)}
					{customs.length > 0 && (
						<optgroup label="내 목록">
							{customs.map((playlist) => (
								<option key={playlist.id} value={playlist.id}>
									{label(playlist)}
								</option>
							))}
						</optgroup>
					)}
				</Select>
				<ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
			</div>
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