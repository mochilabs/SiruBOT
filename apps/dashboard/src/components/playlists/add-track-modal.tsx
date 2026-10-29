"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

import Loader from "@/components/loader";
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
import { isYoutubeUrl } from "@/lib/youtube-url";
import type { SearchedTrack } from "@/types/playlist";

interface AddTrackModalProps {
	open: boolean;
	onClose: () => void;
	trackInput: string;
	onTrackInputChange: (v: string) => void;
	loading: boolean;
	searchLoading: boolean;
	searchError?: Error;
	searchedTracks: SearchedTrack[];
	onAddTrack: (trackId?: string, youtubeUrl?: string) => void;
}

export function AddTrackModal({
	open,
	onClose,
	trackInput,
	onTrackInputChange,
	loading,
	searchLoading,
	searchError,
	searchedTracks,
	onAddTrack,
}: AddTrackModalProps) {
	const isUrl = isYoutubeUrl(trackInput);
	const [keyboardLayout, setKeyboardLayout] = useState<{ top: number; height: number } | null>(null);
	const initialViewportHeight = useRef<number | null>(null);

	useEffect(() => {
		if (!open) {
			initialViewportHeight.current = null;
			setKeyboardLayout(null);
			return;
		}

		const visualViewport = window.visualViewport;
		if (!visualViewport) return;
		initialViewportHeight.current = visualViewport.height;

		const updateViewport = () => {
			const initialHeight = initialViewportHeight.current ?? visualViewport.height;
			const keyboardOpen = initialHeight - visualViewport.height > 100;
			if (!keyboardOpen) {
				setKeyboardLayout(null);
				return;
			}

			const nextLayout = {
				top: Math.max(0, Math.round(visualViewport.offsetTop + 8)),
				height: Math.max(220, Math.round(visualViewport.height - 16)),
			};
			setKeyboardLayout((current) => current?.top === nextLayout.top && current.height === nextLayout.height ? current : nextLayout);
		};

		updateViewport();
		visualViewport?.addEventListener("resize", updateViewport);
		visualViewport?.addEventListener("scroll", updateViewport);
		return () => {
			visualViewport?.removeEventListener("resize", updateViewport);
			visualViewport?.removeEventListener("scroll", updateViewport);
		};
	}, [open]);

	return (
		<Dialog open={open} onOpenChange={(isOpen: boolean) => { if (!isOpen) onClose(); }}>
			<DialogContent
				className={`grid max-h-[calc(100dvh-2rem)] grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-md ${keyboardLayout ? "-translate-y-0 gap-2.5 p-4" : ""}`}
				style={keyboardLayout ? { top: `${keyboardLayout.top}px`, height: `${keyboardLayout.height}px`, maxHeight: `${keyboardLayout.height}px` } : undefined}
			>
				<DialogHeader className="min-w-0 pr-8">
					<DialogTitle className="truncate">플레이리스트에 곡 추가</DialogTitle>
				</DialogHeader>
				<div className={`flex min-h-0 min-w-0 flex-col gap-3 ${keyboardLayout ? "py-0.5" : "h-[360px] py-1"}`}>
					<div className="relative min-w-0 px-0.5 pt-0.5">
						<Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
						<Input
							type="text"
							placeholder="유튜브 링크 또는 곡 제목·아티스트 검색..."
							value={trackInput}
							onChange={(e: React.ChangeEvent<HTMLInputElement>) => onTrackInputChange(e.target.value)}
							className="pl-10"
						/>
					</div>

					<div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-0.5">
						{isUrl ? (
							<div className="flex h-full flex-col items-center justify-center gap-1.5 px-4 text-center">
								<p className="text-sm font-medium text-foreground">링크를 확인했어요.</p>
								<p className="text-xs text-muted-foreground leading-relaxed">
									추가하기를 누르면 영상 정보를 불러와 바로 추가해요.
								</p>
							</div>
						) : searchLoading ? (
							<div className="flex h-full items-center justify-center gap-2">
								<Loader iconOnly size="sm" />
								<span className="text-sm text-muted-foreground">곡 검색 중...</span>
							</div>
						) : searchError ? (
							<div className="flex h-full items-center justify-center px-4 text-center">
								<p className="text-sm text-destructive">YouTube 검색을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>
							</div>
						) : !trackInput.trim() ? (
							<div className="flex h-full items-center justify-center px-4 text-center">
								<p className="text-xs font-medium text-muted-foreground leading-relaxed">
								유튜브 링크를 붙여넣거나 곡 제목·아티스트를 검색해 보세요.
								</p>
							</div>
						) : searchedTracks.length === 0 ? (
							<div className="flex h-full items-center justify-center">
								<p className="text-sm font-medium text-muted-foreground text-center">
									검색 결과가 없어요.
								</p>
							</div>
						) : (
							<div className="space-y-1.5">
								{searchedTracks.map((track) => (
									<div
										key={track.id}
										className="flex min-w-0 items-center justify-between gap-2.5 rounded-card bg-surface-2 p-2 transition-colors duration-fast hover:bg-surface-3"
									>
										<div className="flex min-w-0 flex-1 items-center gap-2.5">
											<Avatar
												src={track.thumbnail || ""}
												fallback="M"
												size="xs"
												className="shrink-0 rounded-control"
											/>
											<div className="min-w-0 flex-1">
												{track.youtubeUrl ? (
													<a
														href={track.youtubeUrl}
														target="_blank"
														rel="noopener noreferrer"
														className="block truncate text-xs font-semibold text-foreground transition-colors duration-fast hover:text-primary-text hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
													>
														{track.title}
													</a>
												) : (
													<p className="truncate text-xs font-semibold text-foreground">{track.title}</p>
												)}
												<p className="truncate text-2xs text-muted-foreground">{track.artist}</p>
											</div>
										</div>
										<Button
											variant="secondary"
											size="sm"
											className="shrink-0 px-3 font-bold"
											onClick={() => onAddTrack(track.youtubeUrl ? undefined : track.id, track.youtubeUrl)}
										>
											추가
										</Button>
									</div>
								))}
							</div>
						)}
					</div>
				</div>
				<DialogFooter className={`shrink-0 ${keyboardLayout ? "-mx-4 -mb-4 px-4 py-2.5" : ""}`}>
					<Button variant="secondary" size="sm" className="w-full sm:w-auto" onClick={onClose}>
						취소
					</Button>
					{isUrl && (
						<Button variant="primary" size="sm" loading={loading} onClick={() => onAddTrack()}>
							추가하기
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
