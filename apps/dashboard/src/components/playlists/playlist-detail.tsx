"use client";

import { useEffect, useRef, useState } from "react";
import { formatDuration } from "@sirubot/utils/time";
import { type Virtualizer } from "@tanstack/react-virtual";
import { Clock, Edit, ExternalLink, GripVertical, Heart, MoreHorizontal, Music, Plus, Settings, Trash2 } from "lucide-react";

import Loader from "@/components/loader";
import { EmptyState } from "@/components/primitives/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FAVORITES_PLAYLIST_NAME } from "@/lib/playlist-constants";
import type { Playlist, Track } from "@/types/playlist";

// 키보드 이동은 부모가 준 드래그 핸들러를 그대로 태워요: onDrop이 부모 상태의 draggedIdx를 읽어야 해서
// onDragStart 호출과 onDrop 호출을 한 렌더씩 나눠야 해요 (재정렬 API는 페이지의 훅에만 있어요).
const dragEventShim = {
	preventDefault() {},
	dataTransfer: { effectAllowed: "move" },
} as unknown as React.DragEvent;

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
	// 위/아래 이동: onDragStart가 부모의 draggedIdx를 세우면 다음 렌더에서 onDrop을 넘겨 재정렬을 요청해요.
	const [pendingMove, setPendingMove] = useState<{ from: number; to: number } | null>(null);
	// 터치(모바일) 길게 누르기 드래그 상태
	const [touchDragIdx, setTouchDragIdx] = useState<number | null>(null);
	const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
	const touchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const touchStartRef = useRef<{ clientY: number; clientX: number } | null>(null);
	const touchActiveRef = useRef(false);

	const clearTouchTimer = () => {
		if (touchTimerRef.current) {
			clearTimeout(touchTimerRef.current);
			touchTimerRef.current = null;
		}
	};

	const clearTouchDrag = () => {
		clearTouchTimer();
		touchActiveRef.current = false;
		touchStartRef.current = null;
		setTouchDragIdx(null);
		setDragOverIdx(null);
	};

	useEffect(() => {
		if (!pendingMove || draggedIdx !== pendingMove.from) return;
		onDrop(dragEventShim, pendingMove.to);
		onDragEnd();
		setPendingMove(null);
	}, [pendingMove, draggedIdx, onDrop, onDragEnd]);

	useEffect(() => {
		return () => clearTouchTimer();
	}, []);

	const moveTrack = (from: number, to: number) => {
		if (to < 0 || to >= tracks.length || from === to) return;
		onDragStart(dragEventShim, from);
		setPendingMove({ from, to });
	};

	/** 모바일: 길게 누르면 해당 행을 드래그 모드로 진입해요. */
	const beginTouchDrag = (idx: number) => {
		touchActiveRef.current = true;
		setTouchDragIdx(idx);
		setDragOverIdx(idx);
		onDragStart(dragEventShim, idx);
	};

	const handleTouchStart = (idx: number) => (e: React.TouchEvent) => {
		if (e.touches.length !== 1) return;
		const touch = e.touches[0]!;
		touchStartRef.current = { clientY: touch.clientY, clientX: touch.clientX };
		clearTouchTimer();
		touchTimerRef.current = setTimeout(() => {
			if (!touchStartRef.current) return;
			beginTouchDrag(idx);
		}, 220);
	};

	const handleTouchMove = (e: React.TouchEvent) => {
		const touch = e.touches[0];
		if (!touch) return;
		if (!touchActiveRef.current) {
			// 아직 드래그 모드가 아니면 스크롤 제스처를 허용해요 (8px 임계값 초과 시 타이머 취소)
			if (touchStartRef.current) {
				const dy = Math.abs(touch.clientY - touchStartRef.current.clientY);
				const dx = Math.abs(touch.clientX - touchStartRef.current.clientX);
				if (dy > 8 || dx > 8) clearTouchTimer();
			}
			return;
		}
		e.preventDefault();
		const parent = parentRef.current;
		if (!parent || touchDragIdx === null) return;
		const rect = parent.getBoundingClientRect();
		const offset = touch.clientY - rect.top + parent.scrollTop;
		const item = rowVirtualizer.getVirtualItemForOffset(offset);
		const clamped = item
			? Math.max(0, Math.min(tracks.length - 1, item.index))
			: Math.max(0, Math.min(tracks.length - 1, Math.floor(offset / 56)));
		setDragOverIdx(clamped);
	};

	const handleTouchEnd = () => {
		if (touchActiveRef.current && touchDragIdx !== null && dragOverIdx !== null && touchDragIdx !== dragOverIdx) {
			moveTrack(touchDragIdx, dragOverIdx);
		}
		clearTouchDrag();
	};

	const handleKeyDown = (idx: number) => (e: React.KeyboardEvent) => {
		if (!e.altKey) return;
		if (e.key === "ArrowUp") {
			e.preventDefault();
			moveTrack(idx, idx - 1);
		} else if (e.key === "ArrowDown") {
			e.preventDefault();
			moveTrack(idx, idx + 1);
		}
	};

	if (detailLoading) {
		return (
			<Card padding="none" className="h-full items-center justify-center p-20">
				<Loader text="플레이리스트 정보를 불러오는 중..." />
			</Card>
		);
	}

	if (!activePlaylist) {
		return <EmptyState icon={Music} title="선택된 플레이리스트가 없어요." description="목록에서 플레이리스트를 선택하거나 새로 만들 수 있어요." className="lg:min-h-[400px]" />;
	}

	return (
		<div className="flex flex-col gap-6 h-full">
			<Card padding="md">
				<div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
					<div className="flex-1">
						<div className="flex items-center gap-3">
							<h1 className="text-xl lg:text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
								{activePlaylist.name === FAVORITES_PLAYLIST_NAME ? (
									<Heart size={24} className="text-primary-text shrink-0" />
								) : (
									<Music size={24} className="text-primary-text shrink-0" />
								)}
								{activePlaylist.name}
							</h1>
						</div>
						<div className="flex flex-wrap items-center gap-2.5 text-xs font-medium text-muted-foreground mt-1.5">
							<div className="flex items-center gap-1.5 font-bold">
								<Music size={14} className="text-primary-text" />
								<span>{stats.count}곡</span>
							</div>
							<div className="w-1 h-1 rounded-full bg-border" />
							<div className="flex items-center gap-1.5 font-bold">
								<Clock size={14} className="text-primary-text" />
								<span>{formatTotalDuration(stats.duration)}</span>
							</div>
							<div className="w-1 h-1 rounded-full bg-border" />
							<span className="flex items-center gap-1.5">
								<GripVertical size={13} className="text-muted-foreground" />
								드래그하거나 길게 눌러 순서 변경
							</span>
							{activePlaylist.description && (
								<>
									<div className="w-1 h-1 rounded-full bg-border" />
									<p>{activePlaylist.description}</p>
								</>
							)}
						</div>
					</div>
					<div className="shrink-0 flex items-center justify-end w-full md:w-auto gap-2 mt-2 md:mt-0">
						{activePlaylist.name !== FAVORITES_PLAYLIST_NAME && (
							<DropdownMenu>
								<DropdownMenuTrigger
									render={
										<Button variant="ghost" className="h-10 px-4 font-bold hover:bg-muted/50">
											<Settings size={16} className="mr-2 opacity-70" />
											설정
										</Button>
									}
								/>
								<DropdownMenuContent align="end">
									<DropdownMenuGroup>
										<DropdownMenuItem onClick={() => onOpenEdit(activePlaylist)}>
											<Edit size={14} />
											정보 수정
										</DropdownMenuItem>
										<DropdownMenuItem variant="destructive" onClick={() => onOpenDelete(activePlaylist.id, activePlaylist.name)}>
											<Trash2 size={14} />
											플레이리스트 삭제
										</DropdownMenuItem>
									</DropdownMenuGroup>
								</DropdownMenuContent>
							</DropdownMenu>
						)}
						<Button variant="primary" size="sm" onClick={onOpenAddTrack} className="px-4 font-bold">
							<Plus size={16} className="mr-1.5" />
							곡 추가
						</Button>
					</div>
				</div>
			</Card>

			<Card padding="none" className="flex-1 overflow-hidden min-h-[320px]" style={{ maxHeight: 'calc(100svh - 17rem)' }}>
				{tracks.length === 0 ? (
					<EmptyState
						className="flex-1 border-none bg-transparent"
						icon={Music}
						title="플레이리스트가 비어있어요"
						description="플레이리스트를 채워보세요!"
						action={
							<Button variant="primary" icon={<Plus size={16} />} onClick={onOpenAddTrack}>
								곡 추가하기
							</Button>
						}
					/>
				) : (
					<div ref={parentRef} className="overflow-auto flex-1 custom-scrollbar w-full">
						<div className="hidden md:flex items-center px-4 py-3 border-b border-border-subtle text-xs font-black text-muted-foreground sticky top-0 z-10">
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
								const isDragging = draggedIdx === idx || touchDragIdx === idx;
								const isDragOver = dragOverIdx === idx && (draggedIdx !== null || touchDragIdx !== null) && draggedIdx !== idx && touchDragIdx !== idx;
								return (
									<div
										key={track.id}
										className={`absolute top-0 left-0 w-full flex items-center px-3 md:px-4 py-1.5 border-b border-border-subtle transition-colors hover:bg-surface-2/50 ${isDragging ? 'opacity-50 bg-primary/5' : ''} ${isDragOver ? 'ring-1 ring-primary-control bg-primary/10' : ''}`}
										style={{
											height: `${virtualRow.size}px`,
											transform: `translateY(${virtualRow.start}px)`,
										}}
										draggable
										onDragStart={(e) => onDragStart(e, idx)}
										onDragOver={(e) => {
											setDragOverIdx(idx);
											onDragOver(e);
										}}
										onDragEnter={(e) => e.preventDefault()}
										onDrop={(e) => {
											onDrop(e, idx);
											setDragOverIdx(null);
										}}
										onDragEnd={() => {
											onDragEnd();
											setDragOverIdx(null);
										}}
										onKeyDown={handleKeyDown(idx)}
										onTouchStart={handleTouchStart(idx)}
										onTouchMove={handleTouchMove}
										onTouchEnd={handleTouchEnd}
										onTouchCancel={handleTouchEnd}
										tabIndex={0}
										role="listitem"
									>
										<div className="flex w-7 md:w-10 shrink-0 items-center justify-center">
											<GripVertical
												size={18}
												className="text-muted-foreground cursor-grab active:cursor-grabbing touch-none"
												aria-hidden
											/>
										</div>
										<span className="w-5 md:hidden shrink-0 text-right text-2xs tabular-nums text-muted-foreground">
											{idx + 1}
										</span>

										<div className="flex-1 min-w-0 flex items-center gap-2.5 md:gap-3">
											<div className="relative w-9 h-9 md:w-10 md:h-10 shrink-0 rounded-card overflow-hidden bg-muted/30 border border-border/40">
												{track.thumbnail ? (
													// eslint-disable-next-line @next/next/no-img-element
													<img src={track.thumbnail} alt={track.title} className="w-full h-full object-cover" />
												) : (
													<div className="w-full h-full flex items-center justify-center">
														<Music size={16} className="text-muted-foreground" />
													</div>
												)}
											</div>
											<div className="min-w-0 flex-1">
												{/^https?:\/\//i.test(track.url ?? "") ? (
													<a
														href={track.url!}
														target="_blank"
														rel="noopener noreferrer"
														className="block truncate font-medium text-foreground text-sm leading-tight mb-0.5 hover:text-primary-text hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm transition-colors duration-fast"
													>
														{track.title}
													</a>
												) : (
													<p className="font-medium text-foreground text-sm truncate leading-tight mb-0.5">{track.title}</p>
												)}

												<p className="md:hidden text-xs text-muted-foreground font-medium truncate flex items-center gap-1.5">
													<span>{track.artist}</span>
													<span className="w-0.5 h-0.5 rounded-full bg-border" />
													<span>{formatDuration(track.duration)}</span>
												</p>

											</div>
										</div>

										<div className="hidden md:block w-32 shrink-0 text-muted-foreground font-medium truncate text-sm px-2">
											{track.artist}
										</div>

										<div className="hidden md:block w-24 shrink-0 text-muted-foreground font-medium tabular-nums text-right text-sm">
											{formatDuration(track.duration)}
										</div>

										<div className="shrink-0 ml-3 md:ml-4 flex items-center justify-center gap-2">
											<DropdownMenu>
												<DropdownMenuTrigger
													render={
														<Button
															variant="icon"
															size="md"
															aria-label={`${track.title} 트랙 메뉴`}
															className="-mr-2 bg-transparent p-2 text-muted-foreground hover:bg-muted/40 hover:text-foreground md:mr-0"
														>
															<MoreHorizontal size={16} />
														</Button>
													}
												/>
												<DropdownMenuContent align="end">
													<DropdownMenuGroup>
														{/^https?:\/\//i.test(track.url ?? "") && (
															<DropdownMenuItem onClick={() => window.open(track.url, "_blank", "noopener,noreferrer")}>
																<ExternalLink size={14} />
																{track.source === "youtube" ? "유튜브에서 열기" : "원본 링크 열기"}
															</DropdownMenuItem>
														)}
														<DropdownMenuItem variant="destructive" onClick={() => onRemoveTrack(track.position, track.title)}>
															<Trash2 size={14} />
															트랙 삭제
														</DropdownMenuItem>
													</DropdownMenuGroup>
												</DropdownMenuContent>
											</DropdownMenu>
										</div>
									</div>
								);
							})}
						</div>

						{/* 흐린 표시는 opacity가 아니라 muted 토큰으로 해요. opacity-40이면 본문 대비가 2.3:1까지 내려가요 */}
						{tracks.length > 0 && (
							<div className="flex flex-col items-center justify-center py-12 mt-4 text-center text-muted-foreground select-none border-t border-border/10">
								<div className="text-xs font-medium mb-1.5 flex items-center gap-2">
									<span>더 이상 표시할 곡이 없어요</span>
								</div>
								<Button variant="ghost" size="sm" onClick={onOpenAddTrack}>
									곡 추가 버튼을 눌러 플레이리스트를 채워보세요!
								</Button>
							</div>
						)}
					</div>
				)}
			</Card>
		</div>
	);
}
