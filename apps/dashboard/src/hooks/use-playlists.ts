"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import useSWR from "swr";

import { useToast } from "@/components/feedback/toast";
import type { Playlist, PlaylistDetailResponse, SearchTracksResponse } from "@/types/playlist";

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

export { formatDuration, formatTotalDuration };

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
		return [...list].sort((a, b) => {
			if (a.name === "즐겨찾기") return -1;
			if (b.name === "즐겨찾기") return 1;
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
		activePlaylistId ? `/api/playlists/${activePlaylistId}` : null
	);

	const activePlaylist = detailData?.playlist ?? null;
	const tracks = useMemo(() => detailData?.tracks ?? [], [detailData?.tracks]);
	const detailLoading = detailLoadingApi;

	const [createModalOpen, setCreateModalOpen] = useState(false);
	const [editModalOpen, setEditModalOpen] = useState(false);
	const [addTrackModalOpen, setAddTrackModalOpen] = useState(false);
	const [deleteModalOpen, setDeleteModalOpen] = useState(false);
	const [removeTrackTarget, setRemoveTrackTarget] = useState<{ position: number; title: string } | null>(null);

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
		setRemoveTrackTarget(null);
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
			if (!res.ok) throw new Error(data.error || "플레이리스트를 만들지 못했어요.");

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
			if (!res.ok) throw new Error(data.error || "플레이리스트를 수정하지 못했어요.");

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
			if (!res.ok) throw new Error(data.error || "플레이리스트를 삭제하지 못했어요.");

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
			if (!res.ok) throw new Error(data.error || "곡을 추가하지 못했어요.");

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

	/** 트랙 삭제 확인 모달을 열어요 (window.confirm 대신 delete-playlist-modal과 같은 모달 확인 패턴) */
	const handleRemoveTrack = (position: number, title: string) => {
		if (!activePlaylistId) return;
		setRemoveTrackTarget({ position, title });
	};

	const confirmRemoveTrack = async () => {
		if (!activePlaylistId || !removeTrackTarget) return;
		const { position } = removeTrackTarget;
		setRemoveTrackTarget(null);
		setLoadingSubmit(true);
		try {
			const res = await fetch(`/api/playlists/${activePlaylistId}/tracks?position=${position}`, {
				method: "DELETE"
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || "곡을 삭제하지 못했어요.");

			toast.success("곡을 삭제했어요.");
			mutateDetail();
			mutateList();
		} catch (err: unknown) {
			toast.error(err instanceof Error ? err.message : "오류가 발생했어요.");
		} finally {
			setLoadingSubmit(false);
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
			if (!res.ok) throw new Error(data.error || "곡 순서를 바꾸지 못했어요.");

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
		removeTrackTarget,
		confirmRemoveTrack,
	};
}
