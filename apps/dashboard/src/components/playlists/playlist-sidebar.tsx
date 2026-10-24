"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Heart, Music, Plus, Search } from "lucide-react";

import { EmptyState } from "@/components/primitives/empty-state";
import { SidebarIndicatorOverlay, useSidebarIndicator } from "@/components/primitives/sidebar-indicator";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FAVORITES_PLAYLIST_NAME } from "@/lib/playlist-constants";
import type { Playlist } from "@/types/playlist";

interface PlaylistSidebarProps {
	playlists: Playlist[];
	activePlaylistId: string | null;
	onSelect: (id: string) => void;
	onCreateNew: () => void;
}

export function PlaylistSidebar({
	playlists,
	activePlaylistId,
	onSelect,
	onCreateNew,
}: PlaylistSidebarProps) {
	const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
	const [searchQuery, setSearchQuery] = useState("");

	const filteredPlaylists = useMemo(() => {
		if (!searchQuery) return playlists;
		return playlists.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));
	}, [playlists, searchQuery]);

	const activeIndex = filteredPlaylists.findIndex((p) => p.id === activePlaylistId);
	const getItemEl = useCallback((index: number) => itemRefs.current[index], []);
	const indicator = useSidebarIndicator(filteredPlaylists, activeIndex, getItemEl);

	return (
		<div className="hidden w-full lg:block lg:w-80 shrink-0 lg:sticky lg:top-24 lg:z-10">
			<Card padding="none" className="overflow-hidden max-h-[calc(100svh-8rem)] lg:min-h-[400px]">
				{playlists.length >= 5 && (
					<div className="p-3 shrink-0">
						<div className="relative">
							<Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
							<Input
								type="text"
								placeholder="검색..."
								aria-label="플레이리스트 검색"
								value={searchQuery}
								onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
								className="bg-input/50 py-2 pl-9 hover:bg-input/60 focus:bg-input/60"
							/>
						</div>
					</div>
				)}

				<div className={`flex-1 overflow-y-auto p-2 flex flex-col gap-0.5 relative ${playlists.length < 5 ? 'pt-2' : ''}`}>
					<SidebarIndicatorOverlay indicator={indicator} />

					{filteredPlaylists.map((playlist, idx) => {
						const isActive = playlist.id === activePlaylistId;
						const isDefault = playlist.name === FAVORITES_PLAYLIST_NAME;
						const isFirstCustom = idx > 0 && filteredPlaylists[idx - 1].name === FAVORITES_PLAYLIST_NAME && !isDefault;

						return (
							<div key={playlist.id} className="w-full flex flex-col">
								{isDefault && idx === 0 && (
									<div className="px-3 pt-2 pb-1.5 text-xs font-medium text-muted-foreground relative z-10">
										즐겨찾기
									</div>
								)}
								{(isFirstCustom || (idx === 0 && !isDefault)) && (
									<div className="px-3 pt-3 pb-1.5 text-xs font-medium text-muted-foreground relative z-10">
										내 목록
									</div>
								)}
								<div
									ref={(el) => { itemRefs.current[idx] = el; }}
									className="group/item flex items-center w-full z-10 relative"
								>
									<button
										type="button"
										onClick={() => onSelect(playlist.id)}
										className={`
											flex-1 flex items-center justify-between px-3 py-2.5 rounded-menu text-left select-none cursor-pointer transition-colors duration-fast
											${isActive ? "text-primary-text font-bold" : "text-muted-foreground hover:text-foreground hover:bg-accent/10"}
										`}
									>
										<div className="flex items-center gap-2 min-w-0">
											{isDefault ? (
												<Heart size={14} className={`shrink-0 ${isActive ? "text-primary-text" : "text-muted-foreground"}`} />
											) : (
												<Music size={14} className={`shrink-0 ${isActive ? "text-primary-text" : "text-muted-foreground"}`} />
											)}
											<span className="truncate text-sm font-medium">{playlist.name}</span>
										</div>

										<span className="text-xs opacity-60 font-medium tabular-nums shrink-0 ml-2">
											{playlist._count?.tracks ?? 0}곡
										</span>
									</button>
								</div>
							</div>
						);
					})}

					{filteredPlaylists.length === 0 && (
						<EmptyState size="sm" title="검색 결과가 없어요." />
					)}

					<div className="pt-2 mt-1">
						<Button
							variant="ghost"
							size="sm"
							onClick={onCreateNew}
							className="h-auto w-full gap-1.5 rounded-menu px-0 py-2.5 text-xs font-medium text-muted-foreground hover:bg-accent/10 hover:text-foreground"
						>
							<Plus size={14} />
							새 플레이리스트
						</Button>
					</div>
				</div>
			</Card>
		</div>
	);
}
