"use client";

import { Suspense } from "react";
import { ListMusic } from "lucide-react";

import Container from "@/components/container";
import { ToastProvider } from "@/components/feedback/toast";
import { PageHeader } from "@/components/layout/page-header";
import Loader from "@/components/loader";
import { AddTrackModal } from "@/components/playlists/add-track-modal";
import { CreatePlaylistModal } from "@/components/playlists/create-playlist-modal";
import { DeletePlaylistModal } from "@/components/playlists/delete-playlist-modal";
import { EditPlaylistModal } from "@/components/playlists/edit-playlist-modal";
import { PlaylistDetail } from "@/components/playlists/playlist-detail";
import { PlaylistSidebar } from "@/components/playlists/playlist-sidebar";
import { usePlaylists } from "@/hooks/use-playlists";

/* ─────────────────────────── Content ─────────────────────────── */

function PlaylistsContent() {
	const {
		status,
		playlists,
		activePlaylistId,
		setActivePlaylistId,
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
	} = usePlaylists();

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
			<PageHeader
				badge="음악 관리"
				badgeIcon={<ListMusic size={16} />}
				title="플레이리스트"
				description="내 플레이리스트를 만들고 트랙 순서를 편집해 관리해보세요."
			/>

			<div className="flex flex-col lg:flex-row gap-8 items-start">
				<PlaylistSidebar
					playlists={playlists}
					activePlaylistId={activePlaylistId}
					onSelect={setActivePlaylistId}
					onCreateNew={openCreateModal}
				/>

				<div className="flex-1 w-full flex flex-col min-h-[500px]">
					<PlaylistDetail
						activePlaylist={activePlaylist}
						tracks={tracks}
						detailLoading={detailLoading}
						stats={stats}
						formatTotalDuration={formatTotalDuration}
						onOpenEdit={openEditModal}
						onOpenDelete={openDeleteModal}
						onOpenAddTrack={openAddTrackModal}
						onRemoveTrack={handleRemoveTrack}
						draggedIdx={draggedIdx}
						onDragStart={handleDragStart}
						onDragOver={handleDragOver}
						onDrop={handleDrop}
						onDragEnd={handleDragEnd}
						parentRef={parentRef}
						rowVirtualizer={rowVirtualizer}
					/>
				</div>
			</div>

			<CreatePlaylistModal
				open={createModalOpen}
				onClose={closeModals}
				nameInput={nameInput}
				descInput={descInput}
				onNameChange={setNameInput}
				onDescChange={setDescInput}
				onSubmit={handleCreatePlaylist}
				loading={loadingSubmit}
			/>

			<EditPlaylistModal
				open={editModalOpen}
				onClose={closeModals}
				nameInput={nameInput}
				descInput={descInput}
				onNameChange={setNameInput}
				onDescChange={setDescInput}
				onSubmit={handleEditPlaylist}
				loading={loadingSubmit}
			/>

			<AddTrackModal
				open={addTrackModalOpen}
				onClose={closeModals}
				tab={addTrackTab}
				onTabChange={(tab) => setAddTrackTab(tab as "url" | "search")}
				youtubeUrl={youtubeUrl}
				onYoutubeUrlChange={setYoutubeUrl}
				trackSearchQuery={trackSearchQuery}
				onTrackSearchQueryChange={setTrackSearchQuery}
				loading={loadingAddTrack}
				searchLoading={searchLoading}
				searchedTracks={searchedTracks}
				onAddTrack={handleAddTrack}
			/>

			<DeletePlaylistModal
				open={deleteModalOpen}
				playlistName={deletePlaylistTarget?.name ?? null}
				onClose={closeModals}
				onConfirm={confirmDeletePlaylist}
				loading={loadingSubmit}
			/>
		</Container>
	);
}

/* ─────────────────────────── Page ─────────────────────────── */

export default function PlaylistsPage() {
	return (
		<ToastProvider>
			<Suspense fallback={<Container><Loader fullPage /></Container>}>
				<PlaylistsContent />
			</Suspense>
		</ToastProvider>
	);
}
