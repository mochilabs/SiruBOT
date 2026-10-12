"use client";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
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

	return (
		<div className="flex w-full items-center gap-2 lg:hidden">
			<div className="min-w-0 flex-1">
				<Select value={activePlaylistId ?? ""} onValueChange={(value: string | null) => { if (value) onSelect(value); }}>
					<SelectTrigger className="w-full">
						{/* Base UI Select.Value는 items 없이 children 함수도 없으면 raw value(UUID)를 그대로 표시해요.
						    선택된 id로 목록에서 찾아 `이름 · N곡` 라벨을 보여 주고, 미선택 시 placeholder 문구를 반환해요. */}
						<SelectValue placeholder="플레이리스트 선택...">
							{(value: string) => {
								if (!value) return "플레이리스트 선택...";
								const selected = playlists.find((p) => p.id === value);
								return selected ? label(selected) : value;
							}}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{favorited.length > 0 && (
							<SelectGroup>
								<SelectLabel>즐겨찾기</SelectLabel>
								{favorited.map((playlist) => (
									<SelectItem key={playlist.id} value={playlist.id}>{label(playlist)}</SelectItem>
								))}
							</SelectGroup>
						)}
						{customs.length > 0 && (
							<SelectGroup>
								<SelectLabel>내 목록</SelectLabel>
								{customs.map((playlist) => (
									<SelectItem key={playlist.id} value={playlist.id}>{label(playlist)}</SelectItem>
								))}
							</SelectGroup>
						)}
					</SelectContent>
				</Select>
			</div>
			<Button variant="icon" size="icon" onClick={onCreateNew} aria-label="새 플레이리스트">
				<Plus size={16} />
			</Button>
		</div>
	);
}
