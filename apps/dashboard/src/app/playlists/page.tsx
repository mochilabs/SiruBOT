"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
	Clock,
	Edit,
	ExternalLink,
	Heart,
	ListMusic,
	Move,
	Music,
	Plus,
	Search,
	Settings,
	Trash2,
	TrendingUp,
	Play,
	ChevronUp,
	ChevronDown,
	MoreHorizontal
} from "lucide-react";
import useSWR from "swr";
import { AnimatePresence, m } from "framer-motion";

import Container from "@/components/container";
import Loader from "@/components/loader";
import { Button } from "@/components/primitives/button";
import { Badge } from "@/components/primitives/badge";
import { Avatar } from "@/components/primitives/avatar";
import { SkeletonLine } from "@/components/primitives/skeleton";
import { ToastProvider, useToast } from "@/components/feedback/toast";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/overlay/modal";
import { Dropdown } from "@/components/overlay/dropdown";
import { Navigation } from "@/components/layout/navigation";
import { StatCard } from "@/components/data/stat-card";
import { PageHeader } from "@/components/layout/page-header";

/* ─────────────────────────── Types ─────────────────────────── */

interface Playlist {
	id: string;
	name: string;
	description: string | null;
	isPublic: boolean;
	createdAt: string;
	_count?: {
		tracks: number;
	};
}

interface Track {
	id: string;
	title: string;
	artist: string;
	duration: number;
	thumbnail: string | null;
	url: string;
	source: string;
	playlistTrackId: string;
	position: number;
	addedAt: string;
}

interface PlaylistDetailResponse {
	playlist: Playlist;
	tracks: Track[];
}

interface SearchedTrack {
	id: string;
	title: string;
	artist: string;
	duration: number;
	thumbnail: string | null;
	url: string;
	source: string;
}

interface SearchTracksResponse {
	tracks: SearchedTrack[];
}

/* ─────────────────────────── Format Helper ─────────────────────────── */

function formatDuration(ms: number): string {
	if (!ms) return "0:00";
	const totalSeconds = Math.floor(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/* ─────────────────────────── Sub-Component: Playlists Sidebar ─────────────────────────── */

interface PlaylistSidebarProps {
	playlists: Playlist[];
	activePlaylistId: string | null;
	onSelect: (id: string) => void;
	onCreateNew: () => void;
	onEdit: (playlist: Playlist) => void;
	onDelete: (id: string, name: string) => void;
}

function PlaylistSidebar({
	playlists,
	activePlaylistId,
	onSelect,
	onCreateNew,
	onEdit,
	onDelete,
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
		<div className="w-full lg:w-80 shrink-0">
			<div className="glass-panel flex flex-col overflow-hidden max-h-[70vh]">
				{playlists.length >= 5 && (
					<div className="p-3 shrink-0">
						<div className="relative">
							<Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70" />
							<input
								type="text"
								placeholder="검색..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="w-full pl-9 pr-4 py-2 bg-muted/40 border border-transparent hover:bg-muted/60 focus:bg-muted/60 rounded-xl text-sm focus:outline-hidden transition-all"
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
									<div className="px-3 pt-2 pb-1.5 text-[10px] font-black tracking-widest text-muted-foreground/60 uppercase relative z-10">
										즐겨찾기
									</div>
								)}
								{(isFirstCustom || (idx === 0 && !isDefault)) && (
									<div className="px-3 pt-3 pb-1.5 text-[10px] font-black tracking-widest text-muted-foreground/60 uppercase relative z-10">
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
											flex-1 flex items-center justify-between px-3 py-2.5 rounded-xl text-left select-none cursor-pointer transition-colors duration-200
											${isActive ? "text-primary font-bold bg-primary/5" : "text-muted-foreground hover:text-foreground hover:bg-accent/10"}
										`}
									>
										<div className="flex items-center gap-2 min-w-0">
											{isDefault ? (
												<Heart size={14} className={`shrink-0 ${isActive ? "text-primary fill-primary" : "text-muted-foreground"}`} />
											) : (
												<Music size={14} className={`shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
											)}
											<span className="truncate text-sm font-bold">{playlist.name}</span>
										</div>
										
										{/* Track Count */}
										<span className="text-xs opacity-60 font-black tabular-nums shrink-0 ml-2">
											{playlist._count?.tracks ?? 0}곡
										</span>
									</button>
								</div>
							</div>
						);
					})}
					
					{filteredPlaylists.length === 0 && (
						<div className="py-8 text-center text-xs text-muted-foreground">
							검색 결과가 없습니다.
						</div>
					)}

					<div className="pt-2 mt-1">
						<button 
							onClick={onCreateNew}
							className="w-full py-2.5 text-xs font-bold text-muted-foreground/80 hover:text-foreground transition-colors flex items-center justify-center gap-1.5 rounded-lg hover:bg-muted/30"
						>
							<Plus size={14} />
							새 플레이리스트
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

/* ─────────────────────────── Main Content Content Component ─────────────────────────── */

function PlaylistsContent() {
	const router = useRouter();
	const { status } = useSession();
	const toast = useToast();

	// Session check
	useEffect(() => {
		if (status === "unauthenticated") {
			router.push("/api/auth/signin?callbackUrl=/playlists");
		}
	}, [status, router]);

	// Playlists fetch
	const { data: listData, mutate: mutateList, isLoading: listLoading } = useSWR<{ playlists: Playlist[] }>(
		status === "authenticated" ? "/api/playlists" : null
	);
	const playlists = useMemo(() => {
		const list = listData?.playlists ?? [];
		return [...list].sort((a, b) => {
			if (a.name === "즐겨찾기") return -1;
			if (b.name === "즐겨찾기") return 1;
			return 0; // maintain original order for the rest
		});
	}, [listData?.playlists]);

	// Active Playlist selection state
	const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);

	// Select first playlist automatically on mount/load
	useEffect(() => {
		if (playlists.length > 0 && !activePlaylistId) {
			// Find "즐겨찾기" if exists, otherwise first
			const fav = playlists.find((p) => p.name === "즐겨찾기");
			setActivePlaylistId(fav ? fav.id : playlists[0].id);
		}
	}, [playlists, activePlaylistId]);

	// Active Playlist tracks fetch
	const { data: detailData, mutate: mutateDetail, isLoading: detailLoading } = useSWR<PlaylistDetailResponse>(
		activePlaylistId ? `/api/playlists/${activePlaylistId}` : null
	);

	const activePlaylist = detailData?.playlist ?? null;
	const tracks = useMemo(() => detailData?.tracks ?? [], [detailData?.tracks]);

	// Modal state
	const [createModalOpen, setCreateModalOpen] = useState(false);
	const [editModalOpen, setEditModalOpen] = useState(false);
	const [addTrackModalOpen, setAddTrackModalOpen] = useState(false);
	const [deleteModalOpen, setDeleteModalOpen] = useState(false);

	// Create/Edit form values
	const [nameInput, setNameInput] = useState("");
	const [descInput, setDescInput] = useState("");
	const [editingPlaylist, setEditingPlaylist] = useState<Playlist | null>(null);
	const [deletePlaylistTarget, setDeletePlaylistTarget] = useState<{id: string, name: string} | null>(null);
	const [loadingSubmit, setLoadingSubmit] = useState(false);

	// Add Track form values
	const [addTrackTab, setAddTrackTab] = useState("url");
	const [youtubeUrl, setYoutubeUrl] = useState("");
	const [trackSearchQuery, setTrackSearchQuery] = useState("");
	const [loadingAddTrack, setLoadingAddTrack] = useState(false);

	// Search cached tracks fetch
	const { data: searchData, isLoading: searchLoading } = useSWR<SearchTracksResponse>(
		addTrackTab === "search" && trackSearchQuery ? `/api/tracks?query=${encodeURIComponent(trackSearchQuery)}` : null
	);
	const searchedTracks = useMemo(() => searchData?.tracks ?? [], [searchData?.tracks]);

	// Drag and drop state
	const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
	const [loadingReorder, setLoadingReorder] = useState(false);

	// Stats calculations
	const stats = useMemo(() => {
		if (!tracks.length) return { count: 0, duration: 0 };
		const sum = tracks.reduce((acc, t) => acc + (t.duration || 0), 0);
		return {
			count: tracks.length,
			duration: sum,
		};
	}, [tracks]);

	const formatTotalDuration = (ms: number): string => {
		if (!ms) return "0분";
		const totalMinutes = Math.floor(ms / 60000);
		if (totalMinutes < 60) return `${totalMinutes}분`;
		const hours = Math.floor(totalMinutes / 60);
		const mins = totalMinutes % 60;
		return `${hours}시간 ${mins}분`;
	};

	// CRUD Playlists: Create
	const handleCreatePlaylist = async () => {
		if (!nameInput.trim()) {
			toast.error("플레이리스트 이름을 입력해주세요.");
			return;
		}
		setLoadingSubmit(true);
		try {
			const res = await fetch("/api/playlists", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: nameInput, description: descInput })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || "Failed to create playlist");

			toast.success("플레이리스트가 생성되었습니다.");
			setNameInput("");
			setDescInput("");
			setCreateModalOpen(false);
			await mutateList();
			setActivePlaylistId(data.playlist.id);
		} catch (err: any) {
			toast.error(err.message || "오류가 발생했습니다.");
		} finally {
			setLoadingSubmit(false);
		}
	};

	// CRUD Playlists: Edit Setup
	const openEditModal = (playlist: Playlist) => {
		setEditingPlaylist(playlist);
		setNameInput(playlist.name);
		setDescInput(playlist.description || "");
		setEditModalOpen(true);
	};

	// CRUD Playlists: Edit Submit
	const handleEditPlaylist = async () => {
		if (!editingPlaylist) return;
		if (!nameInput.trim()) {
			toast.error("플레이리스트 이름을 입력해주세요.");
			return;
		}
		setLoadingSubmit(true);
		try {
			const res = await fetch(`/api/playlists/${editingPlaylist.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: nameInput, description: descInput })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || "Failed to update playlist");

			toast.success("플레이리스트가 수정되었습니다.");
			setEditModalOpen(false);
			setEditingPlaylist(null);
			setNameInput("");
			setDescInput("");
			mutateList();
			if (activePlaylistId === editingPlaylist.id) {
				mutateDetail();
			}
		} catch (err: any) {
			toast.error(err.message || "오류가 발생했습니다.");
		} finally {
			setLoadingSubmit(false);
		}
	};

	// CRUD Playlists: Delete Setup
	const handleDeletePlaylist = (id: string, name: string) => {
		setDeletePlaylistTarget({ id, name });
		setDeleteModalOpen(true);
	};

	// CRUD Playlists: Delete Confirm
	const confirmDeletePlaylist = async () => {
		if (!deletePlaylistTarget) return;
		setLoadingSubmit(true);
		try {
			const res = await fetch(`/api/playlists/${deletePlaylistTarget.id}`, { method: "DELETE" });
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || "Failed to delete playlist");

			toast.success("플레이리스트가 삭제되었습니다.");
			setDeleteModalOpen(false);
			if (activePlaylistId === deletePlaylistTarget.id) {
				setActivePlaylistId(null);
			}
			mutateList();
		} catch (err: any) {
			toast.error(err.message || "오류가 발생했습니다.");
		} finally {
			setLoadingSubmit(false);
		}
	};

	// CRUD Tracks: Add YouTube URL / Cached Track
	const handleAddTrack = async (targetTrackId?: string) => {
		if (!activePlaylistId) return;
		if (!targetTrackId && !youtubeUrl.trim()) {
			toast.error("유튜브 주소를 입력해주세요.");
			return;
		}

		setLoadingAddTrack(true);
		try {
			const res = await fetch(`/api/playlists/${activePlaylistId}/tracks`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(targetTrackId ? { trackId: targetTrackId } : { youtubeUrl })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || "Failed to add track");

			toast.success("곡이 플레이리스트에 추가되었습니다.");
			setYoutubeUrl("");
			setAddTrackModalOpen(false);
			mutateDetail();
			mutateList(); // refresh count
		} catch (err: any) {
			toast.error(err.message || "오류가 발생했습니다.");
		} finally {
			setLoadingAddTrack(false);
		}
	};

	// CRUD Tracks: Remove Track
	const handleRemoveTrack = async (position: number, title: string) => {
		if (!activePlaylistId) return;
		if (!confirm(`'${title}' 곡을 플레이리스트에서 삭제하시겠어요?`)) return;

		try {
			const res = await fetch(`/api/playlists/${activePlaylistId}/tracks?position=${position}`, {
				method: "DELETE"
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || "Failed to delete track");

			toast.success("곡이 삭제되었습니다.");
			mutateDetail();
			mutateList(); // refresh count
		} catch (err: any) {
			toast.error(err.message || "오류가 발생했습니다.");
		}
	};

	// Reorder Tracks (API + Optimistic Update)
	const handleReorder = async (sourceIndex: number, destinationIndex: number) => {
		if (!activePlaylistId || sourceIndex === destinationIndex) return;

		setLoadingReorder(true);

		// Optimistic Update
		const updatedTracks = [...tracks];
		const [moved] = updatedTracks.splice(sourceIndex, 1);
		updatedTracks.splice(destinationIndex, 0, moved);
		// re-index positions
		const reindexed = updatedTracks.map((t, idx) => ({ ...t, position: idx }));

		// Mutate detail with optimistic order
		mutateDetail({ playlist: activePlaylist!, tracks: reindexed }, { revalidate: false });

		try {
			const res = await fetch(`/api/playlists/${activePlaylistId}/reorder`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ sourceIndex, destinationIndex })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || "Failed to reorder");

			toast.success("곡 순서가 변경되었습니다.");
		} catch (err: any) {
			toast.error(err.message || "순서 변경에 실패했습니다.");
		} finally {
			mutateDetail(); // refetch database state
			setLoadingReorder(false);
		}
	};

	// HTML5 Drag and Drop Handlers
	const handleDragStart = (e: React.DragEvent, index: number) => {
		setDraggedIdx(index);
		e.dataTransfer.effectAllowed = "move";
	};

	const handleDragOver = (e: React.DragEvent, index: number) => {
		e.preventDefault();
	};

	const handleDrop = (e: React.DragEvent, index: number) => {
		e.preventDefault();
		if (draggedIdx === null || draggedIdx === index) return;
		handleReorder(draggedIdx, index);
		setDraggedIdx(null);
	};

	const handleDragEnd = () => {
		setDraggedIdx(null);
	};

	if (status === "loading" || listLoading) {
		return (
			<Container>
				<Loader fullPage />
			</Container>
		);
	}

	if (status === "unauthenticated") {
		return null;
	}

	return (
		<Container>
			{/* Page Header */}
			<PageHeader
				badge="음악 관리"
				badgeIcon={<ListMusic size={16} />}
				title="플레이리스트"
				description="내 플레이리스트를 빌드하고, 트랙 순서를 편집하여 관리해 보세요."
			/>

			{/* Main Split Layout */}
			<div className="flex flex-col lg:flex-row gap-8 items-start">
				{/* Left Column: Playlist List */}
				<PlaylistSidebar
					playlists={playlists}
					activePlaylistId={activePlaylistId}
					onSelect={setActivePlaylistId}
					onCreateNew={() => setCreateModalOpen(true)}
					onEdit={openEditModal}
					onDelete={handleDeletePlaylist}
				/>

				{/* Right Column: Track Table & Details */}
				<div className="flex-1 w-full overflow-hidden">
					{detailLoading ? (
						<div className="glass-panel p-20 flex flex-col items-center justify-center min-h-[400px]">
							<Loader text="플레이리스트 정보를 불러오는 중..." />
						</div>
					) : activePlaylist ? (
						<div className="space-y-6">
							{/* Playlist Detail Header */}
							<div className="glass-panel p-6">
								<div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
									<div>
										<h2 className="text-3xl font-black tracking-tight text-foreground flex items-center gap-2">
											{activePlaylist.name === "즐겨찾기" ? (
												<Heart size={24} className="text-primary fill-primary shrink-0" />
											) : (
												<Music size={24} className="text-primary shrink-0" />
											)}
											{activePlaylist.name}
										</h2>
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
															{ key: "edit", label: "수정하기", icon: <Edit size={14} />, onClick: () => openEditModal(activePlaylist) },
															{ key: "delete", label: "삭제하기", icon: <Trash2 size={14} />, danger: true, onClick: () => handleDeletePlaylist(activePlaylist.id, activePlaylist.name) },
														]
													}
												]}
											/>
										)}
										<Button variant="primary" onClick={() => setAddTrackModalOpen(true)} className="h-10 px-5 font-bold shadow-md shadow-primary/20">
											<Plus size={16} className="mr-1.5" />
											곡 추가
										</Button>
									</div>
								</div>
							</div>

							{/* Track List */}
							<div className="glass-panel overflow-hidden">
								{tracks.length === 0 ? (
									<div className="py-24 flex flex-col items-center justify-center text-center">
										<div className="w-20 h-20 bg-primary/5 rounded-full flex items-center justify-center mb-6 border border-primary/10">
											<Music size={32} className="text-primary/60" />
										</div>
										<h3 className="text-2xl font-black text-foreground tracking-tight mb-2">플레이리스트가 비어있어요</h3>
										<p className="text-muted-foreground font-medium max-w-sm mb-8">
											이 플레이리스트에는 아직 추가된 곡이 없네요. 음악을 추가하여 관리해 보세요!
										</p>
										<Button variant="primary" size="lg" className="rounded-full shadow-lg shadow-primary/20 px-8" onClick={() => setAddTrackModalOpen(true)}>
											<Plus size={18} className="mr-2" />
											새 곡 추가하기
										</Button>
									</div>
								) : (
									<div className="overflow-x-auto">
										<table className="w-full text-left text-sm whitespace-nowrap">
											<thead className="bg-muted/30 border-b border-border/40">
												<tr className="text-muted-foreground/70 font-bold uppercase tracking-wider text-xs">
													<th className="px-4 py-3 w-12 text-center">#</th>
													<th className="px-4 py-3">곡 정보</th>
													<th className="px-4 py-3 w-32">아티스트</th>
													<th className="px-4 py-3 w-24 text-right">시간</th>
													<th className="px-4 py-3 w-20 text-center">동작</th>
												</tr>
											</thead>
											<tbody className="divide-y divide-border/20">
												{tracks.map((track, idx) => (
													<tr 
														key={track.id} 
														className={`group transition-colors hover:bg-muted/10 ${draggedIdx === idx ? 'opacity-50 bg-primary/5' : ''}`}
														draggable
														onDragStart={(e) => handleDragStart(e, idx)}
														onDragOver={(e) => handleDragOver(e, idx)}
														onDrop={(e) => handleDrop(e, idx)}
														onDragEnd={handleDragEnd}
													>
														<td className="px-4 py-3 text-center">
															<div className="flex items-center justify-center">
																<span className="text-muted-foreground font-medium group-hover:hidden">
																	{idx + 1}
																</span>
																<Move size={14} className="text-muted-foreground/50 hidden group-hover:block cursor-grab active:cursor-grabbing" />
															</div>
														</td>
														<td className="px-4 py-3 min-w-[240px]">
															<div className="flex items-center gap-3">
																<div className="relative w-10 h-10 shrink-0 rounded-lg overflow-hidden bg-muted/30 border border-border/40">
																	{track.thumbnail ? (
																		<img src={track.thumbnail} alt={track.title} className="w-full h-full object-cover" />
																	) : (
																		<div className="w-full h-full flex items-center justify-center">
																			<Music size={16} className="text-muted-foreground/30" />
																		</div>
																	)}
																</div>
																<div className="truncate max-w-[300px]">
																	<p className="font-bold text-foreground truncate">{track.title}</p>
																	<a href={track.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-0.5">
																		<ExternalLink size={10} />
																		YouTube
																	</a>
																</div>
															</div>
														</td>
														<td className="px-4 py-3 text-muted-foreground font-medium truncate max-w-[150px]">
															{track.artist}
														</td>
														<td className="px-4 py-3 text-muted-foreground font-bold tabular-nums text-right">
															{formatDuration(track.duration)}
														</td>
														<td className="px-4 py-3 text-center">
															<div className="flex justify-center">
																<Button
																	variant="danger"
																	size="sm"
																	className="h-8 w-8 !p-0 rounded-lg hover:bg-rose-500/10 text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100"
																	onClick={() => handleRemoveTrack(track.position, track.title)}
																	title="트랙 삭제"
																>
																	<Trash2 size={15} />
																</Button>
															</div>
														</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
								)}
							</div>
						</div>
					) : (
						<div className="glass-panel p-20 flex flex-col items-center justify-center min-h-[400px] border-dashed text-center">
							<Music size={40} className="text-muted-foreground/30 mb-4 animate-float-subtle" />
							<p className="text-xl font-bold text-muted-foreground">선택된 플레이리스트가 없습니다.</p>
							<p className="text-sm text-muted-foreground/50 mt-1">좌측 목록에서 플레이리스트를 선택하거나 새로 만들어보세요.</p>
						</div>
					)}
				</div>
			</div>

	{/* ─────────────────────────── Modals ─────────────────────────── */ }

{/* Modal: Create Playlist */ }
<Modal open={createModalOpen} onClose={() => setCreateModalOpen(false)}>
	<ModalHeader onClose={() => setCreateModalOpen(false)}>새 플레이리스트 생성</ModalHeader>
	<ModalBody>
		<div className="space-y-4 py-2">
			<div className="space-y-1.5">
				<label htmlFor="p-name" className="text-xs font-black uppercase tracking-wider text-muted-foreground/60">플레이리스트 이름</label>
				<input
					id="p-name"
					type="text"
					placeholder="이름 입력 (예: 코딩할 때 듣는 노동요)"
					value={nameInput}
					onChange={(e) => setNameInput(e.target.value)}
					className="w-full px-4 py-2.5 rounded-xl border border-border/80 bg-muted/20 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-foreground"
					maxLength={50}
				/>
			</div>
			<div className="space-y-1.5">
				<label htmlFor="p-desc" className="text-xs font-black uppercase tracking-wider text-muted-foreground/60">설명 (선택사항)</label>
				<textarea
					id="p-desc"
					placeholder="플레이리스트에 대한 간단한 설명을 입력하세요."
					value={descInput}
					onChange={(e) => setDescInput(e.target.value)}
					className="w-full px-4 py-2.5 rounded-xl border border-border/80 bg-muted/20 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all min-h-[80px] text-foreground resize-none"
					maxLength={200}
				/>
			</div>
		</div>
	</ModalBody>
	<ModalFooter>
		<Button variant="secondary" size="sm" onClick={() => setCreateModalOpen(false)}>
			취소
		</Button>
		<Button variant="primary" size="sm" loading={loadingSubmit} onClick={handleCreatePlaylist}>
			생성하기
		</Button>
	</ModalFooter>
</Modal>

{/* Modal: Edit Playlist */ }
<Modal open={editModalOpen} onClose={() => setEditModalOpen(false)}>
	<ModalHeader onClose={() => setEditModalOpen(false)}>플레이리스트 정보 수정</ModalHeader>
	<ModalBody>
		<div className="space-y-4 py-2">
			<div className="space-y-1.5">
				<label htmlFor="pe-name" className="text-xs font-black uppercase tracking-wider text-muted-foreground/60">플레이리스트 이름</label>
				<input
					id="pe-name"
					type="text"
					value={nameInput}
					onChange={(e) => setNameInput(e.target.value)}
					className="w-full px-4 py-2.5 rounded-xl border border-border/80 bg-muted/20 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-foreground"
					maxLength={50}
				/>
			</div>
			<div className="space-y-1.5">
				<label htmlFor="pe-desc" className="text-xs font-black uppercase tracking-wider text-muted-foreground/60">설명</label>
				<textarea
					id="pe-desc"
					value={descInput}
					onChange={(e) => setDescInput(e.target.value)}
					className="w-full px-4 py-2.5 rounded-xl border border-border/80 bg-muted/20 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all min-h-[80px] text-foreground resize-none"
					maxLength={200}
				/>
			</div>
		</div>
	</ModalBody>
	<ModalFooter>
		<Button variant="secondary" size="sm" onClick={() => setEditModalOpen(false)}>
			취소
		</Button>
		<Button variant="primary" size="sm" loading={loadingSubmit} onClick={handleEditPlaylist}>
			수정 완료
		</Button>
	</ModalFooter>
</Modal>

{/* Modal: Delete Playlist */}
<Modal open={deleteModalOpen} onClose={() => setDeleteModalOpen(false)}>
	<ModalHeader onClose={() => setDeleteModalOpen(false)}>플레이리스트 삭제</ModalHeader>
	<ModalBody>
		<p className="text-sm text-muted-foreground font-medium leading-relaxed py-2">
			정말 <strong>{deletePlaylistTarget?.name}</strong> 플레이리스트를 삭제하시겠어요?<br />
			이 작업은 되돌릴 수 없으며 소속된 트랙 정보도 모두 함께 지워집니다.
		</p>
	</ModalBody>
	<ModalFooter>
		<Button variant="secondary" size="sm" onClick={() => setDeleteModalOpen(false)}>
			취소
		</Button>
		<Button variant="danger" size="sm" loading={loadingSubmit} onClick={confirmDeletePlaylist}>
			삭제하기
		</Button>
	</ModalFooter>
</Modal>

{/* Modal: Add Track */ }
<Modal open={addTrackModalOpen} onClose={() => setAddTrackModalOpen(false)}>
	<ModalHeader onClose={() => setAddTrackModalOpen(false)}>플레이리스트에 곡 추가</ModalHeader>
	<ModalBody>
		<div className="space-y-4 py-2 min-h-[280px]">
			{/* Tab Switch */}
			<div className="flex justify-center border-b border-border/20 pb-2">
				<Navigation
					items={[
						{ key: "url", label: "유튜브 주소 붙여넣기", icon: <Play size={14} className="fill-current" /> },
						{ key: "search", label: "기존 재생 곡에서 추가", icon: <Search size={14} /> },
					]}
					activeKey={addTrackTab}
					onSelect={setAddTrackTab}
					variant="segment"
				/>
			</div>

			{/* Tab Content: URL */}
			{addTrackTab === "url" && (
				<div className="space-y-3 pt-2">
					<div className="space-y-1.5">
						<label htmlFor="tr-url" className="text-xs font-black uppercase tracking-wider text-muted-foreground/60">유튜브 비디오 URL</label>
						<input
							id="tr-url"
							type="text"
							placeholder="https://www.youtube.com/watch?v=..."
							value={youtubeUrl}
							onChange={(e) => setYoutubeUrl(e.target.value)}
							className="w-full px-4 py-2.5 rounded-xl border border-border/80 bg-muted/20 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-foreground"
						/>
					</div>
					<p className="text-xs text-muted-foreground/50 leading-relaxed">
						유튜브 영상 링크 또는 공유 주소를 복사해 입력하면 비디오 메타데이터를 파싱하여 플레이리스트에 즉시 삽입합니다.
					</p>
				</div>
			)}

			{/* Tab Content: Search Cached Tracks */}
			{addTrackTab === "search" && (
				<div className="space-y-3 pt-2">
					<div className="relative">
						<input
							type="text"
							placeholder="곡 제목 또는 아티스트 이름으로 검색..."
							value={trackSearchQuery}
							onChange={(e) => setTrackSearchQuery(e.target.value)}
							className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border/80 bg-muted/20 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-foreground"
						/>
						<Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
					</div>

					{/* Search Results List */}
					<div className="max-h-[220px] overflow-y-auto space-y-1.5 pr-1">
						{searchLoading ? (
							<div className="py-8 flex justify-center">
								<Loader text="곡 검색 중..." />
							</div>
						) : trackSearchQuery && searchedTracks.length === 0 ? (
							<p className="text-sm font-medium text-muted-foreground/60 text-center py-8">
								검색 결과가 없습니다.
							</p>
						) : !trackSearchQuery ? (
							<p className="text-xs font-medium text-muted-foreground/40 text-center py-8 leading-relaxed">
								키워드를 입력해 기존에 봇이 재생했던 이력의 노래들을 찾아보세요.
							</p>
						) : (
							searchedTracks.map((track) => (
								<div
									key={track.id}
									className="glass-panel p-2 flex items-center justify-between gap-3 hover:border-primary/20 transition-all"
								>
									<div className="flex items-center gap-2 min-w-0 flex-1">
										<Avatar
											src={track.thumbnail || ""}
											fallback="M"
											size="xs"
											className="rounded-lg shrink-0"
										/>
										<div className="min-w-0">
											<p className="text-xs font-bold text-foreground truncate">{track.title}</p>
											<p className="text-xs text-muted-foreground truncate">{track.artist}</p>
										</div>
									</div>
									<Button
										variant="secondary"
										size="sm"
										className="h-8 py-0 px-3 shrink-0 rounded-lg text-xs"
										onClick={() => handleAddTrack(track.id)}
									>
										추가
									</Button>
								</div>
							))
						)}
					</div>
				</div>
			)}
		</div>
	</ModalBody>
	<ModalFooter>
		<Button variant="secondary" size="sm" onClick={() => setAddTrackModalOpen(false)}>
			취소
		</Button>
		{addTrackTab === "url" && (
			<Button variant="primary" size="sm" loading={loadingAddTrack} onClick={() => handleAddTrack()}>
				추가하기
			</Button>
		)}
	</ModalFooter>
</Modal>
		</Container >
	);
}

export default function PlaylistsPage() {
	return (
		<ToastProvider>
			<Suspense fallback={<Container><Loader fullPage /></Container>}>
				<PlaylistsContent />
			</Suspense>
		</ToastProvider>
	);
}
