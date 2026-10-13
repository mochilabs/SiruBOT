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
				top: Math.max(0, Math.round(visualViewport.offsetTop + 12)),
				height: Math.max(1, Math.min(280, Math.round(visualViewport.height - 24))),
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
				className={`grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden ${keyboardLayout ? "-translate-y-0" : ""}`}
				style={keyboardLayout ? { top: `${keyboardLayout.top}px`, height: `${keyboardLayout.height}px`, maxHeight: `${keyboardLayout.height}px` } : undefined}
			>
				<DialogHeader>
					<DialogTitle>플레이리스트에 곡 추가</DialogTitle>
				</DialogHeader>
				<div className={`flex min-h-0 flex-col gap-3 py-2 ${keyboardLayout ? "" : "h-[380px]"}`}>
					<div className="relative">
						<Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
						<Input
							type="text"
							placeholder="유튜브 링크 붙여넣기 또는 곡 제목·아티스트 검색..."
							value={trackInput}
							onChange={(e: React.ChangeEvent<HTMLInputElement>) => onTrackInputChange(e.target.value)}
							className="pl-10"
						/>
					</div>

					<div className="min-h-0 flex-1 overflow-y-auto pr-1">
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
											className="shrink-0"
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
				<DialogFooter>
					<Button variant="secondary" size="sm" onClick={onClose}>
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
