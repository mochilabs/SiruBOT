"use client";

import { Play, Search } from "lucide-react";

import { Navigation } from "@/components/layout/navigation";
import Loader from "@/components/loader";
import { Modal, ModalBody, ModalFooter,ModalHeader } from "@/components/overlay/modal";
import { Avatar } from "@/components/primitives/avatar";
import { Button } from "@/components/primitives/button";
import type { SearchedTrack } from "@/types/playlist";

interface AddTrackModalProps {
	open: boolean;
	onClose: () => void;
	tab: "url" | "search";
	onTabChange: (tab: string) => void;
	youtubeUrl: string;
	onYoutubeUrlChange: (v: string) => void;
	trackSearchQuery: string;
	onTrackSearchQueryChange: (v: string) => void;
	loading: boolean;
	searchLoading: boolean;
	searchedTracks: SearchedTrack[];
	onAddTrack: (trackId?: string) => void;
}

export function AddTrackModal({
	open,
	onClose,
	tab,
	onTabChange,
	youtubeUrl,
	onYoutubeUrlChange,
	trackSearchQuery,
	onTrackSearchQueryChange,
	loading,
	searchLoading,
	searchedTracks,
	onAddTrack,
}: AddTrackModalProps) {
	return (
		<Modal open={open} onClose={onClose}>
			<ModalHeader onClose={onClose}>플레이리스트에 곡 추가</ModalHeader>
			<ModalBody>
				<div className="space-y-4 py-2 min-h-[280px]">
					<div className="flex justify-center border-b border-border/20 pb-2">
						<Navigation
							items={[
								{ key: "url", label: "유튜브 주소 붙여넣기", icon: <Play size={14} className="fill-current" /> },
								{ key: "search", label: "기존 재생 곡에서 추가", icon: <Search size={14} /> },
							]}
							activeKey={tab}
							onSelect={onTabChange}
							variant="segment"
						/>
					</div>

					{tab === "url" && (
						<div className="space-y-3 pt-2">
							<div className="space-y-1.5">
								<label htmlFor="tr-url" className="text-xs font-medium uppercase tracking-wider text-muted-foreground/60">유튜브 비디오 URL</label>
								<input
									id="tr-url"
									type="text"
									placeholder="https://www.youtube.com/watch?v=..."
									value={youtubeUrl}
									onChange={(e) => onYoutubeUrlChange(e.target.value)}
									className="w-full px-4 py-2.5 rounded-xl border border-border/80 bg-muted/20 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-foreground"
								/>
							</div>
							<p className="text-xs text-muted-foreground/50 leading-relaxed">
								유튜브 영상 링크 또는 공유 주소를 복사해 입력하면 비디오 메타데이터를 파싱하여 플레이리스트에 즉시 삽입합니다.
							</p>
						</div>
					)}

					{tab === "search" && (
						<div className="space-y-3 pt-2">
							<div className="relative">
								<input
									type="text"
									placeholder="곡 제목 또는 아티스트 이름으로 검색..."
									value={trackSearchQuery}
									onChange={(e) => onTrackSearchQueryChange(e.target.value)}
									className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border/80 bg-muted/20 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-foreground"
								/>
								<Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
							</div>

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
													<p className="text-xs font-medium text-foreground truncate">{track.title}</p>
													<p className="text-xs text-muted-foreground truncate">{track.artist}</p>
												</div>
											</div>
											<Button
												variant="secondary"
												size="sm"
												className="h-8 py-0 px-3 shrink-0 rounded-lg text-xs"
												onClick={() => onAddTrack(track.id)}
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
				<Button variant="secondary" size="sm" onClick={onClose}>
					취소
				</Button>
				{tab === "url" && (
					<Button variant="primary" size="sm" loading={loading} onClick={() => onAddTrack()}>
						추가하기
					</Button>
				)}
			</ModalFooter>
		</Modal>
	);
}
