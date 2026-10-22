"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import useSWR from "swr";

import { useToast } from "@/components/ui/toast";
import { useDebounce } from "@/hooks/use-debounce";
import { FAVORITES_PLAYLIST_NAME } from "@/lib/playlist-constants";
import { useAuthedSWR } from "@/lib/swr";
import { isYoutubeUrl } from "@/lib/youtube-url";
import type { Playlist, PlaylistDetailResponse, SearchTracksResponse } from "@/types/playlist";

function formatTotalDuration(ms: number): string {
	if (!ms) return "0분";
	const totalMinutes = Math.floor(ms / 60000);
	if (totalMinutes < 60) return `${totalMinutes}분`;
	const hours = Math.floor(totalMinutes / 60);
	const mins = totalMinutes % 60;
	return `${hours}시간 ${mins}분`;
}

export { formatTotalDuration };

export function usePlaylists() {
	const { status } = useSession();
	const toast = useToast();

	// 세션 만료 리다이렉트·인증 게이트는 useAuthedSWR가 담당해요 — 로그인 후 이 화면으로 돌아와요
	const { data: listData, mutate: mutateList, isLoading: listLoading } = useAuthedSWR<{ playlists: Playlist[] }>("/api/playlists", "/playlists");

	const playlists = useMemo(() => {
		const list = listData?.playlists ?? [];
		return [...list].sort((a, b) => {
			if (a.name === FAVORITES_PLAYLIST_NAME) return -1;
			if (b.name === FAVORITES_PLAYLIST_NAME) return 1;
			return 0;
		});
	}, [listData?.playlists]);

	const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);

	useEffect(() => {
		if (playlists.length > 0 && !activePlaylistId) {
			const fav = playlists.find((p) => p.name === FAVORITES_PLAYLIST_NAME);
			setActivePlaylistId(fav ? fav.id : playlists[0].id);
		}
	}, [playlists, activePlaylistId]);

	const { data: detailData, mutate: mutateDetail, isLoading: detailLoading } = useSWR<PlaylistDetailResponse>(
		activePlaylistId ? `/api/playlists/${activePlaylistId}` : null
	);

	const activePlaylist = detailData?.playlist ?? null;
	const tracks = useMemo(() => detailData?.tracks ?? [], [detailData?.tracks]);

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

	const [trackInput, setTrackInput] = useState("");
	const [loadingAddTrack, setLoadingAddTrack] = useState(false);

	// 키 입력 1회당 요청이 나가지 않도록 400ms 디바운스 (search-input.tsx와 같은 패턴)
	const debouncedTrackInput = useDebounce(trackInput.trim(), 400);

	const { data: searchData, error: searchError, isLoading: searchLoadingApi } = useSWR<SearchTracksResponse>(
		addTrackModalOpen && debouncedTrackInput && !isYoutubeUrl(debouncedTrackInput)
			? `/api/playlists/search?query=${encodeURIComponent(debouncedTrackInput)}`
			: null,
		{ keepPreviousData: true }
	);
	const searchedTracks = useMemo(() => searchData?.tracks ?? [], [searchData?.tracks]);
	// 디바운스가 아직 따라오지 못한 타이핑 중에도 로딩으로 표시해요
	const searchLoading = searchLoadingApi || trackInput.trim() !== debouncedTrackInput;

	const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

	const parentRef = useRef<HTMLDivElement>(null);
	const rowVirtualizer = useVirtualizer({
		count: tracks.length,
		getScrollElement: () => parentRef.current,
		estimateSize: () => 56,
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
		setTrackInput("");
	}, []);

	/** API 호출 공통 흐름 — 실패 본문의 error를 우선 보여주고 성공/실패 토스트까지 띄워요. 성공 시 본문을, 실패 시 null을 돌려줘요 */
	async function callApi<T>(
		url: string,
		init: RequestInit,
		messages: { success: string; failure: string },
	): Promise<T | null> {
		try {
			const res = await fetch(url, init);
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || messages.failure);
			toast.success(messages.success);
			return data as T;
		} catch (err: unknown) {
			toast.error(err instanceof Error ? err.message : "오류가 발생했어요.");
			return null;
		}
	}

	const handleCreatePlaylist = async () => {
		if (!nameInput.trim()) {
			toast.error("플레이리스트 이름을 입력해 주세요.");
			return;
		}
		setLoadingSubmit(true);
		const data = await callApi<{ playlist: { id: string } }>("/api/playlists", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: nameInput, description: descInput })
		}, { success: "플레이리스트를 만들었어요.", failure: "플레이리스트를 만들지 못했어요." });
		if (data) {
			setNameInput("");
			setDescInput("");
			setCreateModalOpen(false);
			await mutateList();
			setActivePlaylistId(data.playlist.id);
		}
		setLoadingSubmit(false);
	};

	const handleEditPlaylist = async () => {
		if (!editingPlaylist) return;
		if (!nameInput.trim()) {
			toast.error("플레이리스트 이름을 입력해 주세요.");
			return;
		}
		setLoadingSubmit(true);
		const data = await callApi(`/api/playlists/${editingPlaylist.id}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: nameInput, description: descInput })
		}, { success: "플레이리스트 정보를 수정했어요.", failure: "플레이리스트를 수정하지 못했어요." });
		if (data) {
			setEditModalOpen(false);
			setEditingPlaylist(null);
			setNameInput("");
			setDescInput("");
			mutateList();
			if (activePlaylistId === editingPlaylist.id) {
				mutateDetail();
			}
		}
		setLoadingSubmit(false);
	};

	const confirmDeletePlaylist = async () => {
		if (!deletePlaylistTarget) return;
		setLoadingSubmit(true);
		const data = await callApi(`/api/playlists/${deletePlaylistTarget.id}`, { method: "DELETE" }, { success: "플레이리스트를 삭제했어요.", failure: "플레이리스트를 삭제하지 못했어요." });
		if (data) {
			setDeleteModalOpen(false);
			if (activePlaylistId === deletePlaylistTarget.id) {
				setActivePlaylistId(null);
			}
			mutateList();
		}
		setLoadingSubmit(false);
	};

	const handleAddTrack = async (targetTrackId?: string, targetYoutubeUrl?: string) => {
		if (!activePlaylistId) return;
		const trimmedInput = trackInput.trim();
		const youtubeUrl = targetYoutubeUrl ?? (!targetTrackId && isYoutubeUrl(trimmedInput) ? trimmedInput : undefined);
		if (!targetTrackId && !youtubeUrl) {
			toast.error("유튜브 링크를 붙여넣거나 검색 결과에서 곡을 골라 주세요.");
			return;
		}

		setLoadingAddTrack(true);
		const data = await callApi(`/api/playlists/${activePlaylistId}/tracks`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(targetTrackId ? { trackId: targetTrackId } : { youtubeUrl })
		}, { success: "플레이리스트에 곡을 추가했어요.", failure: "곡을 추가하지 못했어요." });
		if (data) {
			setTrackInput("");
			setAddTrackModalOpen(false);
			mutateDetail();
			mutateList();
		}
		setLoadingAddTrack(false);
	};

	/** 트랙 삭제 확인 모달을 열어요 (window.confirm 대신 ConfirmDeleteModal 같은 모달 확인 패턴) */
	const handleRemoveTrack = (position: number, title: string) => {
		if (!activePlaylistId) return;
		setRemoveTrackTarget({ position, title });
	};

	const confirmRemoveTrack = async () => {
		if (!activePlaylistId || !removeTrackTarget) return;
		const { position } = removeTrackTarget;
		setRemoveTrackTarget(null);
		setLoadingSubmit(true);
		const data = await callApi(`/api/playlists/${activePlaylistId}/tracks?position=${position}`, { method: "DELETE" }, { success: "곡을 삭제했어요.", failure: "곡을 삭제하지 못했어요." });
		if (data) {
			mutateDetail();
			mutateList();
		}
		setLoadingSubmit(false);
	};

	const handleReorder = async (sourceIndex: number, destinationIndex: number) => {
		if (!activePlaylistId || sourceIndex === destinationIndex) return;

		const updatedTracks = [...tracks];
		const [moved] = updatedTracks.splice(sourceIndex, 1);
		updatedTracks.splice(destinationIndex, 0, moved);
		const reindexed = updatedTracks.map((t, idx) => ({ ...t, position: idx }));

		mutateDetail({ playlist: activePlaylist!, tracks: reindexed }, { revalidate: false });

		// 실패해도 finally 대신 호출 뒤 무조건 재검증 — 낙관적 업데이트를 실제 서버값으로 정리해요.
		await callApi(`/api/playlists/${activePlaylistId}/reorder`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ sourceIndex, destinationIndex })
		}, { success: "곡 순서를 바꿨어요.", failure: "곡 순서를 바꾸지 못했어요." });
		mutateDetail();
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
		trackInput,
		setTrackInput,
		loadingAddTrack,
		searchedTracks,
		searchLoading,
		searchError,
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
