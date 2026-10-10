"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { m } from "framer-motion";
import { Heart, Music, Plus, Search } from "lucide-react";

import { Button } from "@/components/primitives/button";
import { Card } from "@/components/primitives/card";
import { Input } from "@/components/primitives/input";
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
	const [indicator, setIndicator] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
	const [searchQuery, setSearchQuery] = useState("");

	const filteredPlaylists = useMemo(() => {
		if (!searchQuery) return playlists;
		return playlists.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));
	}, [playlists, searchQuery]);

	useEffect(() => {
		const activeIndex = filteredPlaylists.findIndex((p) => p.id === activePlaylistId);
		const el = activeIndex >= 0 ? itemRefs.current[activeIndex] : null;

		if (!el) {
			setIndicator(null);
			return;
		}

		const update = () => {
			setIndicator({
				top: el.offsetTop,
				left: el.offsetLeft,
				width: el.offsetWidth,
				height: el.offsetHeight,
			});
		};

		update();

		const observer = new ResizeObserver(() => {
			update();
		});
		observer.observe(el);
		if (el.parentElement) {
			observer.observe(el.parentElement);
		}

		return () => observer.disconnect();
	}, [activePlaylistId, filteredPlaylists]);

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
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="border-transparent bg-muted/40 py-2 pl-9 hover:bg-muted/60 focus:bg-muted/60"
							/>
						</div>
					</div>
				)}

				<div className={`flex-1 overflow-y-auto custom-scrollbar p-2 flex flex-col gap-0.5 relative ${playlists.length < 5 ? 'pt-2' : ''}`}>
					{indicator && (
						<m.div
							className="absolute bg-primary/10 rounded-xl z-0 shadow-sm border border-primary/20"
							animate={{
								top: indicator.top,
								left: indicator.left,
								width: indicator.width,
								height: indicator.height,
							}}
							transition={{ type: "spring", stiffness: 400, damping: 30 }}
						/>
					)}

					{filteredPlaylists.map((playlist, idx) => {
						const isActive = playlist.id === activePlaylistId;
						const isDefault = playlist.name === "즐겨찾기";
						const isFirstCustom = idx > 0 && filteredPlaylists[idx - 1].name === "즐겨찾기" && !isDefault;

						return (
							<div key={playlist.id} className="w-full flex flex-col">
								{isDefault && idx === 0 && (
									<div className="px-3 pt-2 pb-1.5 text-2xs font-medium tracking-widest text-muted-foreground uppercase relative z-10">
										즐겨찾기
									</div>
								)}
								{(isFirstCustom || (idx === 0 && !isDefault)) && (
									<div className="px-3 pt-3 pb-1.5 text-2xs font-medium tracking-widest text-muted-foreground uppercase relative z-10">
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
											${isActive ? "text-primary-text font-bold bg-primary/5" : "text-muted-foreground hover:text-foreground hover:bg-accent/10"}
										`}
									>
										<div className="flex items-center gap-2 min-w-0">
											{isDefault ? (
												<Heart size={14} className={`shrink-0 ${isActive ? "text-primary-text fill-primary" : "text-muted-foreground"}`} />
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
						<div className="py-8 text-center text-xs text-muted-foreground">
							검색 결과가 없어요.
						</div>
					)}

					<div className="pt-2 mt-1">
						<Button
							variant="ghost"
							size="sm"
							onClick={onCreateNew}
							className="h-auto w-full gap-1.5 rounded-lg px-0 py-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/30 hover:text-foreground"
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
