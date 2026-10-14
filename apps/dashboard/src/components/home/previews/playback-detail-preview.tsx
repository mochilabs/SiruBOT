"use client";

import Image from "next/image";
import { ListMusic, Music2 } from "lucide-react";

import { PLAYLIST_TRACKS } from "./tracks";

/** 프리뷰용 챕터 — 데모 곡(Justice MV)의 구간 이름. 실제 기능은 15분 이상 곡의 YouTube 챕터를 data-api /v1/chapters로 받아와요 */
const CHAPTERS = ["도입", "전반부", "후반부", "아웃트로"];
/** 진행 바 위 챕터 경계 눈금 위치(%) */
const CHAPTER_TICKS = ["18%", "52%", "79%"];
/** 스폰서 구간 대역 — 실제 설정(SponsorBlock 카테고리)이 켜져 있으면 재생기가 자동으로 건너뛰는 구간이에요 */
const SPONSOR_SEGMENT = { left: "35%", width: "9%" };
const PLAYED_WIDTH = "28%";

/** 재생 디테일 프리뷰 — 스폰서 구간 걷어내기와 챕터 구간 이동, 갭리스·크로스페이드·TTS 겹침 상태를 보여줘요 */
export function PlaybackDetailPreview() {
	return (
		<div className="flex flex-col gap-3 rounded-card bg-discord-embed p-3 sm:p-4">
			<div className="flex items-center gap-2 border-b border-discord-btn-active px-1 pb-2">
				<Music2 size={14} className="text-discord-text-muted" aria-hidden />
				<span className="text-xs font-semibold text-discord-text">지금 재생 중</span>
				<span className="ml-auto text-2xs text-discord-text-muted">#음악-라운지</span>
			</div>

			<div className="flex items-center gap-2.5">
				<div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-sm">
					<Image src={PLAYLIST_TRACKS[0].thumbnail} alt="" fill className="object-cover" sizes="40px" unoptimized />
				</div>
				<div className="min-w-0 flex-1">
					<p className="line-clamp-1 text-sm font-bold text-discord-text">{PLAYLIST_TRACKS[0].title}</p>
					<p className="truncate text-2xs text-discord-text-muted">{PLAYLIST_TRACKS[0].artist}</p>
				</div>
			</div>

			{/* 진행 바 — 챕터 경계 눈금 위에 스폰서 구간 대역이 걷어진 채로 표시돼요 */}
			<div className="flex items-center gap-2 text-2xs tabular-nums text-discord-text-muted">
				<span>0:43 / 4:40</span>
				<div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-discord-btn-active">
					<div className="absolute inset-y-0 left-0 rounded-full bg-primary-control" style={{ width: PLAYED_WIDTH }} />
					{CHAPTER_TICKS.map((left) => (
						<div key={left} className="absolute inset-y-0 w-px bg-discord-text-muted/70" style={{ left }} />
					))}
					<div className="absolute inset-y-0 bg-warning/50" style={{ left: SPONSOR_SEGMENT.left, width: SPONSOR_SEGMENT.width }} />
				</div>
			</div>
			<p className="text-2xs text-discord-text-muted">스폰서 구간은 자동으로 건너뛰었어요 · 챕터 버튼으로 구간 이동</p>

			{/* 챕터 칩 — 컨트롤러의 챕터 버튼으로 넘나드는 구간 표시 */}
			<div className="flex flex-wrap items-center gap-1.5">
				{CHAPTERS.map((chapter, index) => (
					<span
						key={chapter}
						className={
							"rounded-md px-2 py-1 text-2xs font-semibold " +
							(index === 1 ? "bg-discord-primary text-primary-control-text" : "bg-discord-btn-active text-discord-text-muted")
						}
					>
						{chapter}
					</span>
				))}
			</div>

			{/* 믹서 상태 — /믹서에서 갭리스·크로스페이드, /music 음성으로 TTS 겹침 */}
			<div className="flex flex-wrap gap-1.5">
				<span className="flex items-center gap-1.5 rounded-md bg-discord-btn-active px-2 py-1 text-2xs font-semibold text-discord-text">
					<ListMusic size={12} aria-hidden />
					갭리스 재생 켬
				</span>
				<span className="rounded-md bg-discord-btn-active px-2 py-1 text-2xs font-semibold text-discord-text">크로스페이드 4초</span>
				<span className="rounded-md bg-discord-btn-active px-2 py-1 text-2xs font-semibold text-discord-text">TTS 겹침 — 곡 위에 말 얹기</span>
			</div>

			<p className="text-2xs text-discord-text-muted">켜고 끄는 건 /믹서 명령 한 줄이면 돼요.</p>
		</div>
	);
}