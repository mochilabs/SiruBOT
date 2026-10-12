"use client";

import { Play, Search } from "lucide-react";

import Loader from "@/components/loader";
import { Field } from "@/components/primitives/field";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
		<Dialog open={open} onOpenChange={(isOpen: boolean) => { if (!isOpen) onClose(); }}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>플레이리스트에 곡 추가</DialogTitle>
				</DialogHeader>
				<div className="py-2 min-h-[280px]">
					<Tabs value={tab} onValueChange={(value: string | null) => { if (value) onTabChange(value); }}>
						<TabsList aria-label="곡 추가 방식">
							<TabsTrigger value="url">
								<Play size={14} className="fill-current" />
								유튜브 주소 붙여넣기
							</TabsTrigger>
							<TabsTrigger value="search">
								<Search size={14} />
								기존 재생 곡에서 추가
							</TabsTrigger>
						</TabsList>
						<TabsContent value="url">
							<div className="space-y-3">
								<Field htmlFor="tr-url" label="유튜브 비디오 URL">
									<Input
										id="tr-url"
										type="text"
										placeholder="https://www.youtube.com/watch?v=..."
										value={youtubeUrl}
										onChange={(e: React.ChangeEvent<HTMLInputElement>) => onYoutubeUrlChange(e.target.value)}
									/>
								</Field>
								<p className="text-xs text-muted-foreground leading-relaxed">
									유튜브 영상 링크 또는 공유 주소를 복사해 붙여넣으면 메타데이터를 확인해 바로 플레이리스트에 추가해요.
								</p>
							</div>
						</TabsContent>
						<TabsContent value="search">
							<div className="space-y-3">
								<div className="relative">
									<Input
										type="text"
										placeholder="곡 제목 또는 아티스트 이름으로 검색..."
										value={trackSearchQuery}
										onChange={(e: React.ChangeEvent<HTMLInputElement>) => onTrackSearchQueryChange(e.target.value)}
										className="pl-10"
									/>
									<Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
								</div>

								<div className="max-h-[220px] overflow-y-auto space-y-1.5 pr-1">
									{searchLoading ? (
										<div className="py-8 flex justify-center">
											<Loader text="곡 검색 중..." />
										</div>
									) : trackSearchQuery && searchedTracks.length === 0 ? (
										<p className="text-sm font-medium text-muted-foreground text-center py-8">
											검색 결과가 없어요.
										</p>
									) : !trackSearchQuery ? (
										<p className="text-xs font-medium text-muted-foreground text-center py-8 leading-relaxed">
											키워드를 입력해 기존에 봇이 재생했던 이력의 노래들을 찾아보세요.
										</p>
									) : (
										searchedTracks.map((track) => (
											<div
												key={track.id}
												className="rounded-card bg-surface-1 p-2 flex items-center justify-between gap-3 hover:bg-muted/50 transition-colors duration-fast"
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
						</TabsContent>
					</Tabs>
				</div>
				<DialogFooter>
					<Button variant="secondary" size="sm" onClick={onClose}>
						취소
					</Button>
					{tab === "url" && (
						<Button variant="primary" size="sm" loading={loading} onClick={() => onAddTrack()}>
							추가하기
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
