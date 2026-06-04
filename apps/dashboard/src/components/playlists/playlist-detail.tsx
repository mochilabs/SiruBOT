"use client";

import { type Virtualizer } from "@tanstack/react-virtual";
import { Clock, Edit, ExternalLink, Heart, MoreHorizontal, Move, Music, Plus, Settings, Trash2 } from "lucide-react";

import Loader from "@/components/loader";
import { Dropdown } from "@/components/overlay/dropdown";
import { Button } from "@/components/primitives/button";
import { formatDuration } from "@/hooks/use-playlists";
import type { Playlist, Track } from "@/types/playlist";

interface PlaylistDetailProps {
	activePlaylist: Playlist | null;
	tracks: Track[];
	detailLoading: boolean;
	stats: { count: number; duration: number };
	formatTotalDuration: (ms: number) => string;
	onOpenEdit: (playlist: Playlist) => void;
	onOpenDelete: (id: string, name: string) => void;
	onOpenAddTrack: () => void;
	onRemoveTrack: (position: number, title: string) => void;
	draggedIdx: number | null;
	onDragStart: (e: React.DragEvent, idx: number) => void;
	onDragOver: (e: React.DragEvent) => void;
	onDrop: (e: React.DragEvent, idx: number) => void;
	onDragEnd: () => void;
	parentRef: React.RefObject<HTMLDivElement | null>;
	rowVirtualizer: Virtualizer<HTMLDivElement, Element>;
}

export function PlaylistDetail({
	activePlaylist,
	tracks,
	detailLoading,
	stats,
	formatTotalDuration,
	onOpenEdit,
	onOpenDelete,
	onOpenAddTrack,
	onRemoveTrack,
	draggedIdx,
	onDragStart,
	onDragOver,
	onDrop,
	onDragEnd,
	parentRef,
	rowVirtualizer,
}: PlaylistDetailProps) {
	if (detailLoading) {
		return (
			<div className="glass-panel p-20 flex flex-col items-center justify-center h-full">
				<Loader text="플레이리스트 정보를 불러오는 중..." />
			</div>
		);
	}

	if (!activePlaylist) {
		return (
			<div className="glass-panel p-20 flex flex-col items-center justify-center min-h-[400px] border-dashed text-center">
				<Music size={40} className="text-muted-foreground/30 mb-4 animate-float-subtle" />
				<p className="text-xl font-bold text-muted-foreground">선택된 플레이리스트가 없습니다.</p>
				<p className="text-sm text-muted-foreground/50 mt-1">좌측 목록에서 플레이리스트를 선택하거나 새로 만들어보세요.</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-6 h-full">
			<div className="glass-panel p-6">
				<div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
					<div className="flex-1">
						<div className="flex items-center gap-3">
							<h1 className="text-2xl lg:text-3xl font-black tracking-tight text-foreground flex items-center gap-2">
								{activePlaylist.name === "즐겨찾기" ? (
									<Heart size={24} className="text-primary fill-primary shrink-0" />
								) : (
									<Music size={24} className="text-primary shrink-0" />
								)}
								{activePlaylist.name}
							</h1>
						</div>
						<div className="flex flex-wrap items-center gap-3 text-sm font-medium text-muted-foreground/80 mt-2">
							<div className="flex items-center gap-1.5 font-bold">
								<Music size={14} className="text-primary" />
								<span>{stats.count}곡</span>
							</div>
							<div className="w-1 h-1 rounded-full bg-border" />
							<div className="flex items-center gap-1.5 font-bold">
								<Clock size={14} className="text-primary" />
								<span>{formatTotalDuration(stats.duration)}</span>
							</div>
							{activePlaylist.description && (
								<>
									<div className="w-1 h-1 rounded-full bg-border" />
									<p>{activePlaylist.description}</p>
								</>
							)}
						</div>
					</div>
					<div className="shrink-0 flex items-center justify-end w-full md:w-auto gap-2 mt-4 md:mt-0">
						{activePlaylist.name !== "즐겨찾기" && (
							<Dropdown
								align="right"
								trigger={
									<Button variant="ghost" className="h-10 px-4 font-bold border border-border/40 hover:bg-muted/50">
										<Settings size={16} className="mr-2 opacity-70" />
										설정
									</Button>
								}
								groups={[
									{
										items: [
											{ key: "edit", label: "정보 수정", icon: <Edit size={14} />, onClick: () => onOpenEdit(activePlaylist) },
											{ key: "delete", label: "플레이리스트 삭제", icon: <Trash2 size={14} />, danger: true, onClick: () => onOpenDelete(activePlaylist.id, activePlaylist.name) },
										]
									}
								]}
							/>
						)}
						<Button variant="primary" onClick={onOpenAddTrack} className="h-10 px-5 font-bold shadow-md shadow-primary/20">
							<Plus size={16} className="mr-1.5" />
							곡 추가
						</Button>
					</div>
				</div>
			</div>

			<div className="glass-panel flex-1 overflow-hidden flex flex-col min-h-[400px]" style={{ maxHeight: 'calc(100vh - 20rem)' }}>
				{tracks.length === 0 ? (
					<div className="flex-1 py-12 flex flex-col items-center justify-center text-center">
						<div className="w-20 h-20 bg-primary/5 rounded-full flex items-center justify-center mb-6 border border-primary/10">
							<Music size={32} className="text-primary/60" />
						</div>
						<h3 className="text-2xl font-black text-foreground tracking-tight mb-2">플레이리스트가 비어있어요</h3>
						<p className="text-muted-foreground font-medium max-w-sm mb-8">
							플레이리스트를 채워보세요!
						</p>
						<Button variant="primary" size="lg" className="rounded-full shadow-lg shadow-primary/20 px-8" onClick={onOpenAddTrack}>
							<Plus size={18} className="mr-2" />
							곡 추가하기
						</Button>
					</div>
				) : (
					<div ref={parentRef} className="overflow-auto flex-1 custom-scrollbar w-full">
						<div className="hidden md:flex items-center px-4 py-3 bg-muted/30 border-b border-border/40 text-muted-foreground/70 font-medium uppercase tracking-wider text-xs sticky top-0 z-10">
							<div className="w-12 text-center shrink-0">#</div>
							<div className="flex-1 min-w-[240px]">곡 정보</div>
							<div className="w-32 shrink-0 px-2">아티스트</div>
							<div className="w-24 text-right shrink-0">시간</div>
							<div className="w-14 text-center shrink-0 ml-4">동작</div>
						</div>

						<div
							className="w-full relative"
							style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
						>
							{rowVirtualizer.getVirtualItems().map((virtualRow) => {
								const idx = virtualRow.index;
								const track = tracks[idx];
								return (
									<div
										key={track.id}
										className={`absolute top-0 left-0 w-full flex items-center px-4 py-2 border-b border-border/10 group transition-colors hover:bg-muted/10 ${draggedIdx === idx ? 'opacity-50 bg-primary/5' : ''}`}
										style={{
											height: `${virtualRow.size}px`,
											transform: `translateY(${virtualRow.start}px)`,
										}}
										draggable
										onDragStart={(e) => onDragStart(e, idx)}
										onDragOver={onDragOver}
										onDrop={(e) => onDrop(e, idx)}
										onDragEnd={onDragEnd}
									>
										<div className="hidden md:flex w-12 shrink-0 items-center justify-center">
											<span className="text-muted-foreground font-medium group-hover:hidden text-sm">
												{idx + 1}
											</span>
											<Move size={14} className="text-muted-foreground/50 hidden group-hover:block cursor-grab active:cursor-grabbing" />
										</div>

										<div className="flex-1 min-w-0 flex items-center gap-3 md:gap-4">
											<div className="relative w-11 h-11 md:w-10 md:h-10 shrink-0 rounded-lg overflow-hidden bg-muted/30 border border-border/40">
												{track.thumbnail ? (
													<img src={track.thumbnail} alt={track.title} className="w-full h-full object-cover" />
												) : (
													<div className="w-full h-full flex items-center justify-center">
														<Music size={16} className="text-muted-foreground/30" />
													</div>
												)}
											</div>
											<div className="min-w-0 flex-1">
												<p className="font-medium text-foreground text-sm truncate leading-tight mb-0.5">{track.title}</p>

												<p className="md:hidden text-xs text-muted-foreground font-medium truncate flex items-center gap-1.5">
													<span>{track.artist}</span>
													<span className="w-0.5 h-0.5 rounded-full bg-border" />
													<span>{formatDuration(track.duration)}</span>
												</p>

												<a href={track.url} target="_blank" rel="noreferrer" className="hidden md:inline-flex text-[11px] text-primary hover:underline items-center gap-1">
													<ExternalLink size={10} />
													YouTube
												</a>
											</div>
										</div>

										<div className="hidden md:block w-32 shrink-0 text-muted-foreground font-medium truncate text-sm px-2">
											{track.artist}
										</div>

										<div className="hidden md:block w-24 shrink-0 text-muted-foreground font-medium tabular-nums text-right text-sm">
											{formatDuration(track.duration)}
										</div>

										<div className="shrink-0 ml-3 md:ml-4 flex items-center justify-center md:w-14">
											<Dropdown
												align="right"
												trigger={
													<button type="button" className="p-2 -mr-2 md:mr-0 text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 rounded-lg transition-colors cursor-pointer outline-none">
														<MoreHorizontal size={16} />
													</button>
												}
												groups={[
													{
														items: [
															{ key: "delete", label: "트랙 삭제", icon: <Trash2 size={14} />, onClick: () => onRemoveTrack(track.position, track.title), danger: true },
														]
													}
												]}
											/>
										</div>
									</div>
								);
							})}
						</div>

						{tracks.length > 0 && (
							<div className="flex flex-col items-center justify-center py-12 mt-4 text-center opacity-40 select-none border-t border-border/10">
								<div className="text-[13px] font-medium mb-1.5 flex items-center gap-2">
									<span>더이상 표시할 곡이 없어요</span>
								</div>
								<button
									type="button"
									onClick={onOpenAddTrack}
									className="text-xs hover:text-foreground hover:opacity-80 transition-opacity cursor-pointer font-medium"
								>
									곡 추가 버튼을 눌러 플레이리스트를 채워보세요!
								</button>
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
