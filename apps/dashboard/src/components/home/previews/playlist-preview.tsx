"use client";

import Image from "next/image";
import { m } from "framer-motion";

import { cn } from "@/lib/utils";

import { PLAYLIST_TRACKS } from "./tracks";

/** 재생 중 이퀄라이저 — 트랩 행 표시와 부유 카드에서 같은 모티프로 써요 */
function Equalizer() {
	return (
		<span className="flex shrink-0 items-end gap-0.5" aria-hidden>
			{[8, 12, 6, 10].map((h, i) => (
				<m.span
					key={i}
					className="w-0.5 rounded-full bg-primary-control"
					animate={{ height: [h, h + 4, h] }}
					transition={{ duration: 1, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }}
				/>
			))}
		</span>
	);
}

/** 보관함 프리뷰 — 앨범아트 스택 + 트랙 목록. 행들이 스태거로 등장해요 */
export function PlaylistPreview() {
	return (
		<div className="relative pb-10 pr-2">
			<div className="space-y-3 rounded-card bg-surface-2 p-3">
				<div className="flex items-center gap-3 pb-3">
					{/* 앨범아트 2×2 스택 */}
					<div className="grid h-14 w-14 shrink-0 grid-cols-2 overflow-hidden rounded-md border border-border">
						{PLAYLIST_TRACKS.slice(0, 4).map((track) => (
							<div key={track.title} className="relative">
								<Image src={track.thumbnail} alt="" fill className="object-cover" sizes="28px" unoptimized />
							</div>
						))}
					</div>
					<div className="min-w-0 flex-1">
						<p className="truncate text-sm font-bold text-foreground">내 노래모음</p>
						<p className="truncate text-xs text-muted-foreground">5곡 · 17분</p>
					</div>
				</div>
				{/* 치트시트 03. 스태거 — 트랙 행들이 0.04초 간격으로 연쇄 등장 (칩 variants 재사용) */}
				<m.div
					variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.04 } } }}
					initial="hidden"
					whileInView="visible"
					viewport={{ once: true, margin: "-40px" }}
					className="space-y-0.5"
				>
					{PLAYLIST_TRACKS.map((track, index) => (
						<m.div
							key={track.title}
							variants={{ hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } } }}
							className={cn(
								"flex min-w-0 items-center gap-2.5 rounded-sm px-1.5 py-1 text-sm transition-colors",
								index === 0 ? "bg-primary/8" : "hover:bg-surface-1",
							)}
						>
							<span className="w-3 shrink-0 text-2xs tabular-nums text-muted-foreground">{index + 1}</span>
							<div className="min-w-0 flex-1">
								<p className="truncate font-medium text-foreground">{track.title}</p>
							</div>
							<span className="shrink-0 text-2xs text-muted-foreground">{track.artist}</span>
							{index === 0 ? (
								<Equalizer />
							) : (
								<span className="shrink-0 text-2xs tabular-nums text-muted-foreground">{track.duration}</span>
							)}
						</m.div>
					))}
				</m.div>
			</div>
			{/* 재생 중 상태 — 보관함 데모의 이퀄라이저와 같은 모티프 (실제 상태: 보관함을 채널에서 이어재생) */}
			<div
				aria-hidden
				className="absolute bottom-0 left-2 flex w-52 -rotate-2 items-center gap-2.5 rounded-card bg-surface-1 p-3 shadow-lg sm:left-8"
			>
				<Equalizer />
				<div className="min-w-0">
					<p className="truncate text-2xs font-bold text-foreground">내 노래모음 재생 중</p>
					<p className="text-2xs text-muted-foreground">채널에서 이어서 재생</p>
				</div>
			</div>
		</div>
	);
}