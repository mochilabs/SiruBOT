"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import useSWR from "swr";

import { useToast } from "@/components/feedback/toast";
import type { Playlist, PlaylistDetailResponse, SearchTracksResponse, Track } from "@/types/playlist";

/* ─────────────────────────── Constants ─────────────────────────── */

const MOCK_PLAYLIST_ID = "mock-demo-playlist";

const MOCK_PLAYLIST: Playlist = {
	id: MOCK_PLAYLIST_ID,
	name: "🔥 작업용 노동요 모음 (데모)",
	description: "집중력을 200% 올려주는 코딩 필수 재생목록 (반응형 UI 데모 테스트용)",
	isPublic: true,
	createdAt: new Date().toISOString(),
	_count: { tracks: 20 }
};

const MOCK_TRACKS: Track[] = [
	{ id: "dQw4w9WgXcQ", title: "Never Gonna Give You Up", artist: "Rick Astley", duration: 212000, thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg", url: "https://youtube.com/watch?v=dQw4w9WgXcQ", source: "youtube", playlistTrackId: "pt1", position: 0, addedAt: new Date().toISOString() },
	{ id: "fJ9rUzIMcZQ", title: "Bohemian Rhapsody", artist: "Queen", duration: 354000, thumbnail: "https://i.ytimg.com/vi/fJ9rUzIMcZQ/hqdefault.jpg", url: "https://youtube.com/watch?v=fJ9rUzIMcZQ", source: "youtube", playlistTrackId: "pt2", position: 1, addedAt: new Date().toISOString() },
	{ id: "kJQP7kiw5Fk", title: "Despacito", artist: "Luis Fonsi", duration: 288000, thumbnail: "https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg", url: "https://youtube.com/watch?v=kJQP7kiw5Fk", source: "youtube", playlistTrackId: "pt3", position: 2, addedAt: new Date().toISOString() },
	{ id: "JGwWNGJdvx8", title: "Shape of You", artist: "Ed Sheeran", duration: 233000, thumbnail: "https://i.ytimg.com/vi/JGwWNGJdvx8/hqdefault.jpg", url: "https://youtube.com/watch?v=JGwWNGJdvx8", source: "youtube", playlistTrackId: "pt4", position: 3, addedAt: new Date().toISOString() },
	{ id: "OPf0YbXqDm0", title: "Uptown Funk", artist: "Mark Ronson", duration: 270000, thumbnail: "https://i.ytimg.com/vi/OPf0YbXqDm0/hqdefault.jpg", url: "https://youtube.com/watch?v=OPf0YbXqDm0", source: "youtube", playlistTrackId: "pt5", position: 4, addedAt: new Date().toISOString() },
	{ id: "L_jWHffIx5E", title: "Smells Like Teen Spirit", artist: "Nirvana", duration: 278000, thumbnail: "https://i.ytimg.com/vi/L_jWHffIx5E/hqdefault.jpg", url: "https://youtube.com/watch?v=L_jWHffIx5E", source: "youtube", playlistTrackId: "pt6", position: 5, addedAt: new Date().toISOString() },
	{ id: "fLexgOxsZu0", title: "Treasure", artist: "Bruno Mars", duration: 178000, thumbnail: "https://i.ytimg.com/vi/fLexgOxsZu0/hqdefault.jpg", url: "https://youtube.com/watch?v=fLexgOxsZu0", source: "youtube", playlistTrackId: "pt7", position: 6, addedAt: new Date().toISOString() },
	{ id: "CevxZvSJLk8", title: "Roar", artist: "Katy Perry", duration: 223000, thumbnail: "https://i.ytimg.com/vi/CevxZvSJLk8/hqdefault.jpg", url: "https://youtube.com/watch?v=CevxZvSJLk8", source: "youtube", playlistTrackId: "pt8", position: 7, addedAt: new Date().toISOString() },
	{ id: "pB-5XG-DbAA", title: "Counting Stars", artist: "OneRepublic", duration: 257000, thumbnail: "https://i.ytimg.com/vi/pB-5XG-DbAA/hqdefault.jpg", url: "https://youtube.com/watch?v=pB-5XG-DbAA", source: "youtube", playlistTrackId: "pt9", position: 8, addedAt: new Date().toISOString() },
	{ id: "1G4isv_Fylg", title: "Paradise", artist: "Coldplay", duration: 278000, thumbnail: "https://i.ytimg.com/vi/1G4isv_Fylg/hqdefault.jpg", url: "https://youtube.com/watch?v=1G4isv_Fylg", source: "youtube", playlistTrackId: "pt10", position: 9, addedAt: new Date().toISOString() },
	{ id: "YykjpeuMNEk", title: "Hymn For The Weekend", artist: "Coldplay", duration: 258000, thumbnail: "https://i.ytimg.com/vi/YykjpeuMNEk/hqdefault.jpg", url: "https://youtube.com/watch?v=YykjpeuMNEk", source: "youtube", playlistTrackId: "pt11", position: 10, addedAt: new Date().toISOString() },
	{ id: "09R8_2nJtjg", title: "Sugar", artist: "Maroon 5", duration: 301000, thumbnail: "https://i.ytimg.com/vi/09R8_2nJtjg/hqdefault.jpg", url: "https://youtube.com/watch?v=09R8_2nJtjg", source: "youtube", playlistTrackId: "pt12", position: 11, addedAt: new Date().toISOString() },
	{ id: "kffacxfA7G4", title: "Baby", artist: "Justin Bieber", duration: 219000, thumbnail: "https://i.ytimg.com/vi/kffacxfA7G4/hqdefault.jpg", url: "https://youtube.com/watch?v=kffacxfA7G4", source: "youtube", playlistTrackId: "pt13", position: 12, addedAt: new Date().toISOString() },
	{ id: "RBumgq5yVrA", title: "Let Her Go", artist: "Passenger", duration: 252000, thumbnail: "https://i.ytimg.com/vi/RBumgq5yVrA/hqdefault.jpg", url: "https://youtube.com/watch?v=RBumgq5yVrA", source: "youtube", playlistTrackId: "pt14", position: 13, addedAt: new Date().toISOString() },
	{ id: "C_3d6GntKbk", title: "Hey Jude", artist: "The Beatles", duration: 431000, thumbnail: "https://i.ytimg.com/vi/C_3d6GntKbk/hqdefault.jpg", url: "https://youtube.com/watch?v=C_3d6GntKbk", source: "youtube", playlistTrackId: "pt15", position: 14, addedAt: new Date().toISOString() },
	{ id: "hT_nvWreIhg", title: "Counting Stars (Live)", artist: "OneRepublic", duration: 260000, thumbnail: "https://i.ytimg.com/vi/hT_nvWreIhg/hqdefault.jpg", url: "https://youtube.com/watch?v=hT_nvWreIhg", source: "youtube", playlistTrackId: "pt16", position: 15, addedAt: new Date().toISOString() },
	{ id: "PT2_F-1esPk", title: "Closer", artist: "The Chainsmokers", duration: 244000, thumbnail: "https://i.ytimg.com/vi/PT2_F-1esPk/hqdefault.jpg", url: "https://youtube.com/watch?v=PT2_F-1esPk", source: "youtube", playlistTrackId: "pt17", position: 16, addedAt: new Date().toISOString() },
	{ id: "R_VXUe7qS1I", title: "Wake Me Up", artist: "Avicii", duration: 272000, thumbnail: "https://i.ytimg.com/vi/R_VXUe7qS1I/hqdefault.jpg", url: "https://youtube.com/watch?v=R_VXUe7qS1I", source: "youtube", playlistTrackId: "pt18", position: 17, addedAt: new Date().toISOString() },
	{ id: "uelHwf8o7_U", title: "Love The Way You Lie", artist: "Eminem", duration: 266000, thumbnail: "https://i.ytimg.com/vi/uelHwf8o7_U/hqdefault.jpg", url: "https://youtube.com/watch?v=uelHwf8o7_U", source: "youtube", playlistTrackId: "pt19", position: 18, addedAt: new Date().toISOString() },
	{ id: "nfWlot6h_JM", title: "Shake It Off", artist: "Taylor Swift", duration: 241000, thumbnail: "https://i.ytimg.com/vi/nfWlot6h_JM/hqdefault.jpg", url: "https://youtube.com/watch?v=nfWlot6h_JM", source: "youtube", playlistTrackId: "pt20", position: 19, addedAt: new Date().toISOString() }
];

function formatDuration(ms: number): string {
	if (!ms) return "0:00";
	const totalSeconds = Math.floor(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatTotalDuration(ms: number): string {
	if (!ms) return "0분";
	const totalMinutes = Math.floor(ms / 60000);
	if (totalMinutes < 60) return `${totalMinutes}분`;
	const hours = Math.floor(totalMinutes / 60);
	const mins = totalMinutes % 60;
	return `${hours}시간 ${mins}분`;
}

export { formatDuration, formatTotalDuration, MOCK_PLAYLIST_ID };

/* ─────────────────────────── Hook ─────────────────────────── */

export function usePlaylists() {
	const router = useRouter();
	const { status } = useSession();
	const toast = useToast();

	useEffect(() => {
		if (status === "unauthenticated") {
			router.push("/api/auth/signin?callbackUrl=/playlists");
		}
	}, [status, router]);

	const { data: listData, mutate: mutateList, isLoading: listLoading } = useSWR<{ playlists: Playlist[] }>(
		status === "authenticated" ? "/api/playlists" : null
	);

	const playlists = useMemo(() => {
		const list = listData?.playlists ?? [];
		return [MOCK_PLAYLIST, ...list].sort((a, b) => {
			if (a.name === "즐겨찾기") return -1;
			if (b.name === "즐겨찾기") return 1;
			if (a.id === MOCK_PLAYLIST_ID) return -1;
			if (b.id === MOCK_PLAYLIST_ID) return 1;
			return 0;
		});
	}, [listData?.playlists]);

	const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);

	useEffect(() => {
		if (playlists.length > 0 && !activePlaylistId) {
			const fav = playlists.find((p) => p.name === "즐겨찾기");
			setActivePlaylistId(fav ? fav.id : playlists[0].id);
		}
	}, [playlists, activePlaylistId]);

	const { data: detailData, mutate: mutateDetail, isLoading: detailLoadingApi } = useSWR<PlaylistDetailResponse>(
		activePlaylistId && activePlaylistId !== MOCK_PLAYLIST_ID ? `/api/playlists/${activePlaylistId}` : null
	);

	const isMock = activePlaylistId === MOCK_PLAYLIST_ID;
	const activePlaylist = isMock ? MOCK_PLAYLIST : (detailData?.playlist ?? null);
	const tracks = useMemo(() => isMock ? MOCK_TRACKS : (detailData?.tracks ?? []), [isMock, detailData?.tracks]);
	const detailLoading = !isMock && detailLoadingApi;

	const [createModalOpen, setCreateModalOpen] = useState(false);
	const [editModalOpen, setEditModalOpen] = useState(false);
	const [addTrackModalOpen, setAddTrackModalOpen] = useState(false);
	const [deleteModalOpen, setDeleteModalOpen] = useState(false);

	const [nameInput, setNameInput] = useState("");
	const [descInput, setDescInput] = useState("");
	const [editingPlaylist, setEditingPlaylist] = useState<Playlist | null>(null);
	const [deletePlaylistTarget, setDeletePlaylistTarget] = useState<{ id: string, name: string } | null>(null);
	const [loadingSubmit, setLoadingSubmit] = useState(false);

	const [addTrackTab, setAddTrackTab] = useState<"url" | "search">("url");
	const [youtubeUrl, setYoutubeUrl] = useState("");
	const [trackSearchQuery, setTrackSearchQuery] = useState("");
	const [loadingAddTrack, setLoadingAddTrack] = useState(false);

	const { data: searchData, isLoading: searchLoading } = useSWR<SearchTracksResponse>(
		addTrackTab === "search" && trackSearchQuery ? `/api/tracks?query=${encodeURIComponent(trackSearchQuery)}` : null
	);
	const searchedTracks = useMemo(() => searchData?.tracks ?? [], [searchData?.tracks]);

	const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

	const parentRef = useRef<HTMLDivElement>(null);
	const rowVirtualizer = useVirtualizer({
		count: tracks.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => 64,
		overscan: 5,
	});

	const stats = useMemo(() => {
		if (!tracks.length) return { count: 0, duration: 0 };
		const sum = tracks.reduce((acc, t) => acc + (t.duration || 0), 0);
		return { count: tracks.length, duration: sum };
	}, [tracks]);

	const openCreateModal = () => setCreateModalOpen(true);

	const openEditModal = (playlist: Playlist) => {
		setEditingPlaylist(playlist);
		setNameInput(playlist.name);
		setDescInput(playlist.description || "");
		setEditModalOpen(true);
	};

	const openAddTrackModal = () => setAddTrackModalOpen(true);

	const openDeleteModal = (id: string, name: string) => {
		setDeletePlaylistTarget({ id, name });
		setDeleteModalOpen(true);
	};

	const closeModals = useCallback(() => {
		setCreateModalOpen(false);
		setEditModalOpen(false);
		setAddTrackModalOpen(false);
		setDeleteModalOpen(false);
		setEditingPlaylist(null);
		setNameInput("");
		setDescInput("");
		setYoutubeUrl("");
	}, []);

	const handleCreatePlaylist = async () => {
		if (!nameInput.trim()) {
			toast.error("플레이리스트 이름을 입력해 주세요.");
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

			toast.success("플레이리스트를 만들었어요.");
			setNameInput("");
			setDescInput("");
			setCreateModalOpen(false);
			await mutateList();
			setActivePlaylistId(data.playlist.id);
		} catch (err: unknown) {
			toast.error(err instanceof Error ? err.message : "오류가 발생했어요.");
		} finally {
			setLoadingSubmit(false);
		}
	};

	const handleEditPlaylist = async () => {
		if (!editingPlaylist) return;
		if (!nameInput.trim()) {
			toast.error("플레이리스트 이름을 입력해 주세요.");
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

			toast.success("플레이리스트 정보를 수정했어요.");
			setEditModalOpen(false);
			setEditingPlaylist(null);
			setNameInput("");
			setDescInput("");
			mutateList();
			if (activePlaylistId === editingPlaylist.id) {
				mutateDetail();
			}
		} catch (err: unknown) {
			toast.error(err instanceof Error ? err.message : "오류가 발생했어요.");
		} finally {
			setLoadingSubmit(false);
		}
	};

	const confirmDeletePlaylist = async () => {
		if (!deletePlaylistTarget) return;
		setLoadingSubmit(true);
		try {
			const res = await fetch(`/api/playlists/${deletePlaylistTarget.id}`, { method: "DELETE" });
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || "Failed to delete playlist");

			toast.success("플레이리스트를 삭제했어요.");
			setDeleteModalOpen(false);
			if (activePlaylistId === deletePlaylistTarget.id) {
				setActivePlaylistId(null);
			}
			mutateList();
		} catch (err: unknown) {
			toast.error(err instanceof Error ? err.message : "오류가 발생했어요.");
		} finally {
			setLoadingSubmit(false);
		}
	};

	const handleAddTrack = async (targetTrackId?: string) => {
		if (!activePlaylistId) return;
		if (!targetTrackId && !youtubeUrl.trim()) {
			toast.error("유튜브 주소를 입력해 주세요.");
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

			toast.success("플레이리스트에 곡을 추가했어요.");
			setYoutubeUrl("");
			setAddTrackModalOpen(false);
			mutateDetail();
			mutateList();
		} catch (err: unknown) {
			toast.error(err instanceof Error ? err.message : "오류가 발생했어요.");
		} finally {
			setLoadingAddTrack(false);
		}
	};

	const handleRemoveTrack = async (position: number, title: string) => {
		if (!activePlaylistId) return;
		if (!confirm(`'${title}' 곡을 삭제할까요?`)) return;

		try {
			const res = await fetch(`/api/playlists/${activePlaylistId}/tracks?position=${position}`, {
				method: "DELETE"
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || "Failed to delete track");

			toast.success("곡을 삭제했어요.");
			mutateDetail();
			mutateList();
		} catch (err: unknown) {
			toast.error(err instanceof Error ? err.message : "오류가 발생했어요.");
		}
	};

	const handleReorder = async (sourceIndex: number, destinationIndex: number) => {
		if (!activePlaylistId || sourceIndex === destinationIndex) return;

		const updatedTracks = [...tracks];
		const [moved] = updatedTracks.splice(sourceIndex, 1);
		updatedTracks.splice(destinationIndex, 0, moved);
		const reindexed = updatedTracks.map((t, idx) => ({ ...t, position: idx }));

		mutateDetail({ playlist: activePlaylist!, tracks: reindexed }, { revalidate: false });

		try {
			const res = await fetch(`/api/playlists/${activePlaylistId}/reorder`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ sourceIndex, destinationIndex })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || "Failed to reorder");

			toast.success("곡 순서를 바꿨어요.");
		} catch (err: unknown) {
			toast.error(err instanceof Error ? err.message : "곡 순서를 바꾸지 못했어요.");
		} finally {
			mutateDetail();
		}
	};

	const handleDragStart = (e: React.DragEvent, index: number) => {
		setDraggedIdx(index);
		e.dataTransfer.effectAllowed = "move";
	};

	const handleDragOver = (e: React.DragEvent) => {
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

	return {
		status: status as "loading" | "authenticated" | "unauthenticated",
		playlists,
		activePlaylistId,
		setActivePlaylistId,
		mutateList,
		listLoading,
		activePlaylist,
		tracks,
		detailLoading,
		stats,
		formatTotalDuration,
		formatDuration,
		createModalOpen,
		editModalOpen,
		addTrackModalOpen,
		deleteModalOpen,
		openCreateModal,
		openEditModal,
		openAddTrackModal,
		openDeleteModal,
		closeModals,
		nameInput,
		descInput,
		setNameInput,
		setDescInput,
		editingPlaylist,
		deletePlaylistTarget,
		loadingSubmit,
		addTrackTab,
		setAddTrackTab,
		youtubeUrl,
		setYoutubeUrl,
		trackSearchQuery,
		setTrackSearchQuery,
		loadingAddTrack,
		searchedTracks,
		searchLoading,
		draggedIdx,
		handleDragStart,
		handleDragOver,
		handleDrop,
		handleDragEnd,
		parentRef,
		rowVirtualizer,
		handleCreatePlaylist,
		handleEditPlaylist,
		confirmDeletePlaylist,
		handleAddTrack,
		handleRemoveTrack,
	};
}
